#!/usr/bin/env node
import path from "node:path";
import { EZdeployError } from "@ezdeploy/contracts";
import { RemoteDeploymentService } from "./remote-service.js";

interface CliOptions {
  command: "plan" | "deploy";
  apiUrl: string;
  connectCode: string;
  projectDirectory: string;
  environment: string;
  planDigest?: string;
}

function usage(): never {
  process.stderr.write(`Usage:
  node zaodeploy-agent.cjs plan --api-url <url> --connect-code <ZAO-XXXX-XXXX> [directory]
  node zaodeploy-agent.cjs deploy --api-url <url> --connect-code <ZAO-XXXX-XXXX> --plan-digest <sha256> [directory]

Options:
  --environment <name>   Deployment environment (default: production)
  --plan-digest <sha256> Digest returned by plan after explicit user confirmation
  --json                 Emit machine-readable JSON (default)
`);
  process.exit(2);
}

function parseArguments(argv: string[]): CliOptions {
  const [command, ...rest] = argv;
  if (!["plan", "deploy"].includes(command ?? "")) usage();
  let apiUrl = "";
  let connectCode = "";
  let environment = "production";
  let projectDirectory = process.cwd();
  let planDigest: string | undefined;
  for (let index = 0; index < rest.length; index++) {
    const value = rest[index];
    if (value === "--api-url") apiUrl = rest[++index] ?? "";
    else if (value === "--connect-code") connectCode = rest[++index] ?? "";
    else if (value === "--environment") environment = rest[++index] ?? "";
    else if (value === "--plan-digest") planDigest = rest[++index] ?? "";
    else if (value === "--json") continue;
    else if (!value.startsWith("-")) projectDirectory = path.resolve(value);
    else usage();
  }
  if (!apiUrl || !/^ZAO-[A-Z2-9]{4}-[A-Z2-9]{4}$/i.test(connectCode) || !environment) usage();
  if (command === "deploy" && !/^[a-f0-9]{64}$/.test(planDigest ?? "")) usage();
  return {
    command: command as "plan" | "deploy",
    apiUrl: apiUrl.replace(/\/$/, ""),
    connectCode: connectCode.toUpperCase(),
    projectDirectory,
    environment,
    planDigest,
  };
}

async function exchange(options: CliOptions) {
  const response = await fetch(`${options.apiUrl}/v1/connect/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: options.connectCode,
      label: `Temporary agent session on ${process.platform}`,
    }),
  });
  const body = await response.json() as {
    connectionKey?: string;
    expiresAt?: string;
    scopes?: string[];
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !body.connectionKey) {
    throw new EZdeployError(
      "DEPLOY_FAILED",
      body.error?.message ?? `Connection exchange failed with HTTP ${response.status}`,
      { code: body.error?.code },
    );
  }
  return body;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.command === "plan") {
    const service = new RemoteDeploymentService({
      baseUrl: options.apiUrl,
      token: "not-exchanged-during-plan-preview",
      cloudBundle: true,
    });
    const plan = await service.previewWithConnectCode(
      options.projectDirectory,
      options.connectCode,
    );
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  let session: Awaited<ReturnType<typeof exchange>> | undefined;
  const service = new RemoteDeploymentService({
    baseUrl: options.apiUrl,
    tokenProvider: async () => {
      session ??= await exchange(options);
      return session.connectionKey!;
    },
    cloudBundle: true,
  });
  const result = await service.deploy({
    projectDirectory: options.projectDirectory,
    ownerId: "authenticated-zero-install-user",
    environment: options.environment,
  }, options.planDigest);
  process.stdout.write(`${JSON.stringify({
    status: result.deployment.status,
    url: result.deployment.url,
    deploymentId: result.deployment.id,
    expiresAt: session?.expiresAt,
    confirmedPlanDigest: options.planDigest,
  }, null, 2)}\n`);
}

main().catch((error) => {
  const details = error instanceof EZdeployError
    ? { code: error.code, message: error.message, details: error.details }
    : { code: "INTERNAL_ERROR", message: error instanceof Error ? error.message : String(error) };
  process.stderr.write(`${JSON.stringify({ error: details }, null, 2)}\n`);
  process.exitCode = 1;
});
