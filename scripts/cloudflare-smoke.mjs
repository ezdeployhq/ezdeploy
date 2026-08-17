#!/usr/bin/env node
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { RemoteDeploymentService } from "../apps/mcp-server/dist/remote-service.js";

const required = [
  "ZAODEPLOY_CONTROL_PLANE_URL",
  "ZAODEPLOY_CONTROL_PLANE_TOKEN",
  "CF_ACCESS_CLIENT_ID",
  "CF_ACCESS_CLIENT_SECRET",
  "CLOUDFLARE_ACCESS_GROUP_ID",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing smoke-test variables: ${missing.join(", ")}`);
  process.exit(1);
}

async function waitForAccessPropagation(check, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw lastError ?? new Error(`${label} did not become active within ${timeoutMs}ms`);
}

const slug = `zaodeploy-smoke-${Date.now().toString(36)}`;
const project = path.resolve(".zaodeploy", "smoke", slug);
await mkdir(path.dirname(project), { recursive: true });
await cp(path.resolve("examples/vite-internal-app"), project, {
  recursive: true,
  filter: (source) => !source.includes(`${path.sep}dist`),
});
const manifestPath = path.join(project, "ezdeploy.yaml");
await writeFile(
  manifestPath,
  (await readFile(manifestPath, "utf8"))
    .replace("vite-internal-example", slug)
    .replace(
      "    mode: organization",
      `    mode: organization\n    allowedGroups:\n      - ${process.env.CLOUDFLARE_ACCESS_GROUP_ID}`,
    ),
  "utf8",
);

const service = new RemoteDeploymentService({
  baseUrl: process.env.ZAODEPLOY_CONTROL_PLANE_URL,
  token: process.env.ZAODEPLOY_CONTROL_PLANE_TOKEN,
  accessClientId: process.env.CF_ACCESS_CLIENT_ID,
  accessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
});
let activeId;
let firstReleaseMs;
let stage = "plan";
try {
  const plan = await service.plan(project);
  if (plan.resources.length !== 3 || plan.access?.mode !== "organization") {
    throw new Error("Unexpected deployment plan");
  }
  const started = Date.now();
  stage = "first deployment";
  const first = await service.deploy({ projectDirectory: project, ownerId: "derived-remotely" });
  firstReleaseMs = Date.now() - started;
  activeId = first.deployment.id;
  if (first.deployment.status !== "ready" || !first.deployment.url) throw new Error("First release not ready");
  if (firstReleaseMs > 5 * 60_000) throw new Error("First release exceeded five minutes");

  stage = "Access propagation";
  await waitForAccessPropagation(async () => {
    const response = await fetch(first.deployment.url, { redirect: "manual" });
    return response.status !== 200 ? response : null;
  }, "Anonymous Access rejection");
  const accessHeaders = {
    "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID,
    "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET,
  };
  stage = "runtime bindings";
  const { status, capabilities } = await waitForAccessPropagation(async () => {
    const response = await fetch(new URL("/api/status", first.deployment.url), { headers: accessHeaders });
    if (!response.ok) return null;
    const body = await response.json();
    return body.database && body.storage && body.ai ? { status: response, capabilities: body } : null;
  }, "Service-token Access");
  if (!status.ok) throw new Error(`Runtime bindings failed: ${JSON.stringify(capabilities)}`);
  stage = "default-chat";
  await waitForAccessPropagation(async () => {
    const response = await fetch(new URL("/api/chat", first.deployment.url), {
      method: "POST",
      headers: { ...accessHeaders, "content-type": "application/json" },
      body: JSON.stringify({ message: "Reply with exactly OK" }),
    });
    if (!response.ok) throw new Error(`default-chat failed with HTTP ${response.status}`);
    return response;
  }, "default-chat");

  stage = "repeated deployment";
  const second = await service.deploy({ projectDirectory: project, ownerId: "derived-remotely" });
  activeId = second.deployment.id;
  stage = "catalog validation";
  const catalog = await service.listApplications();
  const entry = catalog.find((candidate) => candidate.application.slug === slug);
  if (!entry || entry.deployment?.id !== second.deployment.id || entry.resources.length !== 3) {
    throw new Error("Repeated deployment did not preserve catalog and bindings");
  }
  stage = "runtime logs";
  const logsPromise = service.getLogs(second.deployment.id);
  const traffic = setInterval(() => {
    void fetch(new URL("/api/status", second.deployment.url), { headers: accessHeaders }).catch(() => {});
  }, 500);
  let logs;
  try {
    logs = await logsPromise;
  } finally {
    clearInterval(traffic);
  }
  if (!Array.isArray(logs.events) || !logs.events.some((entry) => entry.status === "ready")) {
    throw new Error("Structured online deployment events were not persisted");
  }
  if (!Array.isArray(logs.runtime) || logs.runtime.length === 0) {
    throw new Error(`Live runtime Tail did not capture the smoke request: ${logs.runtimeError ?? "no events"}`);
  }
  const serializedLogs = JSON.stringify(logs);
  for (const secret of [
    process.env.ZAODEPLOY_CONTROL_PLANE_TOKEN,
    process.env.CF_ACCESS_CLIENT_ID,
    process.env.CF_ACCESS_CLIENT_SECRET,
  ]) {
    if (secret && serializedLogs.includes(secret)) throw new Error("A scoped operational credential leaked into Agent-visible logs");
  }

  stage = "failed-release recovery";
  const healthyManifest = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    healthyManifest.replace("ai: true", "ai: false"),
    "utf8",
  );
  let failedAsExpected = false;
  try {
    await service.deploy({ projectDirectory: project, ownerId: "derived-remotely" });
  } catch { failedAsExpected = true; }
  if (!failedAsExpected) throw new Error("Intentionally unhealthy release unexpectedly became ready");
  await writeFile(manifestPath, healthyManifest, "utf8");
  const afterFailure = (await service.listApplications())
    .find((candidate) => candidate.application.slug === slug);
  if (afterFailure?.deployment?.id !== second.deployment.id) {
    throw new Error("Failed release displaced the active healthy release");
  }
  const failedRelease = afterFailure.recentDeployments.find((candidate) => candidate.status === "failed");
  if (!failedRelease) throw new Error("Failed release was not persisted in recent versions");
  const failedLogs = await service.getLogs(failedRelease.id);
  const failureState = await service.getDeployment(failedRelease.id);
  if (failureState.error_code !== "HEALTH_CHECK_FAILED") {
    throw new Error("Failed release did not preserve a structured health-check error");
  }

  stage = "rollback";
  const restored = await service.rollbackDeployment(first.deployment.id);
  activeId = first.deployment.id;
  if (!restored.url) throw new Error("Restore did not return a URL");
  stage = "application deletion";
  const deleted = await service.deleteDeployment(first.deployment.id, true);
  if (!deleted.resourcesRemoved || !deleted.deleted) {
    throw new Error("Application deletion did not report complete resource cleanup");
  }
  if ((await service.listApplications()).some((candidate) => candidate.application.slug === slug)) {
    throw new Error("Deleted application remained visible in the application center");
  }
  activeId = undefined;
  console.log(JSON.stringify({
    passed: true,
    application: slug,
    firstReleaseMs,
    tested: ["D1", "R2", "default-chat", "Access", "redeploy", "failed-release recovery", "logs", "rollback", "delete"],
  }, null, 2));
} catch (error) {
  const details = error && typeof error === "object" && "details" in error ? error.details : undefined;
  console.error(`${stage}: ${error instanceof Error ? error.message : String(error)}${details ? ` ${JSON.stringify(details)}` : ""}`);
  if (activeId) {
    try { await service.deleteDeployment(activeId, true); } catch {}
  }
  process.exitCode = 1;
} finally {
  await rm(project, { recursive: true, force: true });
}
