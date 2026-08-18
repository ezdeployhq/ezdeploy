#!/usr/bin/env node
/**
 * One-command Cloudflare installation for EZdeploy.
 *
 * Idempotent: safe to re-run. Existing D1 databases, R2 buckets, and generated
 * secrets are reused; wrangler.json files, migrations, deployments, and the
 * R2 lifecycle rule are refreshed on every run.
 *
 * Interactive by default; non-interactive with env vars:
 *   EZD_DOMAIN_SUFFIX=apps.example.com EZD_API_TOKEN=... EZD_ACCOUNT_ID=... \
 *   EZD_ZONE_ID=... EZD_YES=1 node scripts/cloudflare-setup.mjs
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

const root = path.resolve(import.meta.dirname, "..");
const stateDir = path.join(root, ".zaodeploy");
const statePath = path.join(stateDir, "setup-state.json");
const yes = process.env.EZD_YES === "1" || process.argv.includes("--yes");

const NAMES = {
  controlPlane: "ezdeploy-control-plane",
  agentIngress: "ezdeploy-agent",
  appCenter: "ezdeploy-app-center",
  aiProxy: "ezdeploy-ai-proxy",
  d1: "ezdeploy-control",
  r2: "ezdeploy-sources",
};
const ARTIFACT_TTL_DAYS = 30;

function fail(message) {
  console.error(`ERROR ${message}`);
  process.exit(1);
}
function step(message) {
  console.log(`\n== ${message}`);
}
function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    stdio: options.input !== undefined ? ["pipe", "pipe", "inherit"] : "inherit",
    input: options.input,
    env: { ...process.env, ...(options.env ?? {}) },
  });
}
function secretValue(length = 32) {
  return randomBytes(length).toString("base64url");
}

async function api(token, method, pathname, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const reason = payload.errors?.map((error) => error.message).filter(Boolean).join("; ") || `HTTP ${response.status}`;
    throw new Error(`${method} ${pathname}: ${reason}`);
  }
  return payload.result;
}

// ---- preflight -------------------------------------------------------------
if (!existsSync(path.join(root, "node_modules", ".bin", "wrangler"))) {
  fail("Run 'npm install' first; wrangler was not found in node_modules.");
}
try {
  execFileSync(path.join(root, "node_modules", ".bin", "wrangler"), ["whoami"], { stdio: "pipe" });
} catch {
  fail("Wrangler is not authenticated. Run 'npx wrangler login' first, then re-run this script.");
}

// ---- collect inputs ----------------------------------------------------------
const rl = yes ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
// Sequential rl.question() calls lose buffered lines when stdin is piped; the async
// iterator buffers correctly for both interactive terminals and redirected input.
const lines = rl ? rl[Symbol.asyncIterator]() : null;
async function ask(label, fallback, envName) {
  if (process.env[envName]) return process.env[envName];
  if (yes) return fallback ?? "";
  const suffixText = fallback ? ` [${fallback}]` : "";
  process.stdout.write(`${label}${suffixText}: `);
  const answer = ((await lines.next()).value ?? "").trim();
  return answer || fallback || "";
}

step("Installation settings");
const suffix = await ask("Application domain suffix (apps live under *.<suffix>)", "", "EZD_DOMAIN_SUFFIX");
if (!suffix || !suffix.includes(".")) fail("A domain suffix such as apps.example.com is required.");
const apiToken = await ask("Cloudflare API token (D1/Pages/R2/Workers AI/DNS write)", process.env.CLOUDFLARE_API_TOKEN ?? "", "EZD_API_TOKEN");
if (!apiToken) fail("A Cloudflare API token is required. See docs/cloudflare-setup.md for the permission list.");
const zoneGuess = suffix.split(".").slice(-2).join(".");
const zoneName = await ask("Cloudflare zone name", zoneGuess, "EZD_ZONE_NAME");
const ownerId = await ask("Owner ID shown in the application center", "personal-owner", "EZD_OWNER_ID");
const enableAccess = (await ask("Enable Cloudflare Access for protected apps? (yes/no)", "no", "EZD_ENABLE_ACCESS"))
  .toLowerCase().startsWith("y");
rl?.close();

// ---- account, zone, subdomain ------------------------------------------------
step("Resolving account, zone, and workers.dev subdomain");
let accountId = process.env.EZD_ACCOUNT_ID ?? "";
if (!accountId) {
  const accounts = await api(apiToken, "GET", "/accounts?per_page=1").catch((error) => fail(String(error.message ?? error)));
  accountId = accounts?.[0]?.id ?? "";
}
if (!accountId) fail("Could not resolve the Cloudflare account ID.");
let zoneId = process.env.EZD_ZONE_ID ?? "";
if (!zoneId) {
  const zones = await api(apiToken, "GET", `/zones?name=${encodeURIComponent(zoneName)}&per_page=1`).catch(() => null);
  zoneId = zones?.[0]?.id ?? "";
}
if (!zoneId) fail(`Could not find zone '${zoneName}' with this token. Re-run with EZD_ZONE_ID set.`);
const subdomain = (await api(apiToken, "GET", `/accounts/${accountId}/workers/subdomain`).catch(() => null))?.subdomain ?? "";
const workersDev = (name) => (subdomain ? `https://${name}.${subdomain}.workers.dev` : `https://${name}.workers.dev`);
console.log(`account ${accountId}  zone ${zoneName} (${zoneId})`);

// ---- shared secrets ----------------------------------------------------------
step("Preparing shared secrets");
mkdirSync(stateDir, { recursive: true });
const prior = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const state = {
  controlPlaneToken: prior.controlPlaneToken ?? secretValue(),
  aiControlToken: prior.aiControlToken ?? secretValue(),
  aiEncryptionKey: prior.aiEncryptionKey ?? randomBytes(32).toString("base64"),
};
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
chmodSync(statePath, 0o600);
console.log(`Shared secrets stored in ${path.relative(root, statePath)} (mode 0600, git-ignored).`);

// ---- resources ---------------------------------------------------------------
step("Ensuring D1 database and R2 bucket");
const databases = await api(apiToken, "GET", `/accounts/${accountId}/d1/database?per_page=100`);
let database = databases?.find((item) => item.name === NAMES.d1);
if (!database) {
  database = await api(apiToken, "POST", `/accounts/${accountId}/d1/database`, { name: NAMES.d1 });
  console.log(`created D1 ${NAMES.d1}`);
}
const bucketList = await api(apiToken, "GET", `/accounts/${accountId}/r2/buckets?per_page=100`);
const buckets = bucketList?.buckets ?? [];
if (!buckets.some((item) => item.name === NAMES.r2)) {
  await api(apiToken, "PUT", `/accounts/${accountId}/r2/buckets/${NAMES.r2}`).catch((error) => {
    fail(`Creating the R2 bucket failed: ${error.message}. New accounts must activate R2 once in the dashboard (a payment method may be requested; the free allowance is not billed).`);
  });
  console.log(`created R2 bucket ${NAMES.r2}`);
}
console.log(`D1 ${NAMES.d1} (${database.uuid ?? database.id})  R2 ${NAMES.r2}`);

step("Setting R2 lifecycle rule (deployment bundles expire after 30 days)");
try {
  run("npx", ["wrangler", "r2", "bucket", "lifecycle", "add", NAMES.r2, "expire-deployment-bundles", "deployments/", "--expire-days", String(ARTIFACT_TTL_DAYS), "--force"]);
  run("npx", ["wrangler", "r2", "bucket", "lifecycle", "add", NAMES.r2, "abort-incomplete-uploads", "--abort-multipart-days", "7", "--force"]);
} catch {
  console.warn("WARN Could not set R2 lifecycle rules automatically; add them in the dashboard to bound storage cost.");
}

// ---- wrangler.json files -------------------------------------------------------
step("Writing apps/*/wrangler.json");
const urls = {
  appCenter: `https://center.${suffix}`,
  agent: `https://deploy.${suffix}`,
  controlPlane: workersDev(NAMES.controlPlane),
  aiProxy: workersDev(NAMES.aiProxy),
};
function writeConfig(app, patch) {
  const examplePath = path.join(root, "apps", app, "wrangler.example.json");
  const config = JSON.parse(readFileSync(examplePath, "utf8"));
  patch(config);
  writeFileSync(path.join(root, "apps", app, "wrangler.json"), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`apps/${app}/wrangler.json`);
}
writeConfig("cloud-control-plane", (config) => {
  config.d1_databases[0].database_id = database.uuid ?? database.id;
  Object.assign(config.vars, {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_ZONE_ID: zoneId,
    AI_PROXY_URL: urls.aiProxy,
    ACCESS_ENABLED: enableAccess ? "true" : "false",
    ACCESS_GROUP_ID: process.env.EZD_ACCESS_GROUP_ID ?? "",
    ACCESS_SERVICE_TOKEN_ID: process.env.EZD_ACCESS_SERVICE_TOKEN_ID ?? "",
    EMPLOYEE_OWNER_ID: ownerId,
    APP_CENTER_URL: urls.appCenter,
    APPLICATION_DOMAIN_SUFFIX: suffix,
  });
});
writeConfig("ai-proxy", (config) => {
  config.d1_databases[0].database_id = database.uuid ?? database.id;
  config.vars.AI_GATEWAY_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
});
writeConfig("cloud-app-center", (config) => {
  config.d1_databases[0].database_id = database.uuid ?? database.id;
  Object.assign(config.vars, {
    CONTROL_PLANE_URL: urls.controlPlane,
    AGENT_GATEWAY_URL: urls.agent,
    AI_PROXY_URL: urls.aiProxy,
    OWNER_ID: ownerId,
  });
  config.routes = [{ pattern: `center.${suffix}`, custom_domain: true }];
});
writeConfig("agent-ingress", (config) => {
  config.vars.APP_CENTER_URL = urls.appCenter;
  config.routes = [{ pattern: `deploy.${suffix}`, custom_domain: true }];
});

// ---- migrate, build, deploy ------------------------------------------------------
step("Applying D1 migrations");
run("npx", ["wrangler", "d1", "migrations", "apply", NAMES.d1, "--remote", "--config", "apps/cloud-control-plane/wrangler.json"]);
run("npx", ["wrangler", "d1", "migrations", "apply", NAMES.d1, "--remote", "--config", "apps/ai-proxy/wrangler.json"]);

step("Building the standalone agent client");
run("npm", ["run", "build:agent-client"]);

step("Deploying workers (control plane, AI proxy, app center, agent ingress)");
for (const app of ["cloud-control-plane", "ai-proxy", "cloud-app-center", "agent-ingress"]) {
  run("npx", ["wrangler", "deploy", "--config", `apps/${app}/wrangler.json`]);
}

step("Uploading secrets");
const secrets = [
  ["cloud-control-plane", "CLOUDFLARE_API_TOKEN", apiToken],
  ["cloud-control-plane", "CONTROL_PLANE_TOKEN", state.controlPlaneToken],
  ["cloud-control-plane", "AI_CONTROL_TOKEN", state.aiControlToken],
  ["ai-proxy", "AI_GATEWAY_TOKEN", apiToken],
  ["ai-proxy", "CONTROL_PLANE_TOKEN", state.controlPlaneToken],
  ["ai-proxy", "AI_PROVIDER_ENCRYPTION_KEY", state.aiEncryptionKey],
  ["cloud-app-center", "AI_ADMIN_TOKEN", state.controlPlaneToken],
];
if (enableAccess) {
  if (!process.env.EZD_ACCESS_CLIENT_ID || !process.env.EZD_ACCESS_CLIENT_SECRET) {
    console.warn("WARN Access enabled but EZD_ACCESS_CLIENT_ID/SECRET not provided; skipping those secrets.");
  } else {
    secrets.push(
      ["cloud-control-plane", "ACCESS_CLIENT_ID", process.env.EZD_ACCESS_CLIENT_ID],
      ["cloud-control-plane", "ACCESS_CLIENT_SECRET", process.env.EZD_ACCESS_CLIENT_SECRET],
    );
  }
}
for (const [app, name, value] of secrets) {
  run("npx", ["wrangler", "secret", "put", name, "--config", `apps/${app}/wrangler.json`], { input: value });
}

step("Done");
console.log(`EZdeploy is installed:
  application center  ${urls.appCenter}/center   (create the administrator account on first visit)
  agent endpoint      ${urls.agent}/agent.md
  control plane       ${urls.controlPlane}
  AI proxy            ${urls.aiProxy}
Next: open the application center, create the admin account, then generate a deployment
prompt from the deploy page. Re-run this script any time to redeploy or rotate code;
shared secrets in ${path.relative(root, statePath)} are reused so issued keys stay valid.`);
