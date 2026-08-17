#!/usr/bin/env node

const required = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
const checks = [
  ["Pages account access", "/pages/projects"],
  ["D1 account access", "/d1/database"],
  ["R2 account access", "/r2/buckets"],
];
if (process.env.CLOUDFLARE_ACCESS_ENABLED === "true") {
  checks.push(["Access Apps and Policies", "/access/apps"]);
  const accessRequired = [
    "CLOUDFLARE_ACCESS_SERVICE_TOKEN_IDS",
    "CLOUDFLARE_ACCESS_SERVICE_CLIENT_ID",
    "CLOUDFLARE_ACCESS_SERVICE_CLIENT_SECRET",
  ];
  const accessMissing = accessRequired.filter((name) => !process.env[name]);
  if (accessMissing.length) {
    console.error(`Missing Access variables required for first and repeated health checks: ${accessMissing.join(", ")}`);
    process.exit(1);
  }
  if (!process.env.CLOUDFLARE_ACCESS_EMAIL_DOMAIN) {
    console.warn("WARN No default Access email domain; every organization manifest must declare allowedGroups");
  }
}

let failed = false;
const verification = await fetch(`${base}/tokens/verify`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!verification.ok) {
  failed = true;
  console.error(`FAIL API token verification: HTTP ${verification.status}`);
} else {
  console.log("PASS API token verification");
}
for (const [label, pathname] of checks) {
  const response = await fetch(`${base}${pathname}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok || body.success === false) {
    failed = true;
    const reason = body.errors?.map((error) => error.message).filter(Boolean).join("; ") || `HTTP ${response.status}`;
    console.error(`FAIL ${label}: ${reason}`);
  } else {
    console.log(`PASS ${label}`);
  }
}

const aiVariables = ["ZAODEPLOY_AI_PROXY_URL", "ZAODEPLOY_AI_CONTROL_TOKEN", "ZAODEPLOY_ENCRYPTION_KEY"];
const configuredAiVariables = aiVariables.filter((name) => process.env[name]);
if (configuredAiVariables.length > 0 && configuredAiVariables.length < aiVariables.length) {
  failed = true;
  console.error(`FAIL AI issuer: configure all of ${aiVariables.join(", ")}, or none of them`);
} else if (process.env.ZAODEPLOY_AI_PROXY_URL) {
  const key = Buffer.from(process.env.ZAODEPLOY_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32 || !process.env.ZAODEPLOY_AI_CONTROL_TOKEN) {
    failed = true;
    console.error("FAIL AI issuer: valid encryption key and AI control token are required");
  } else {
    try {
      const response = await fetch(`${process.env.ZAODEPLOY_AI_PROXY_URL.replace(/\/$/, "")}/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      console.log("PASS AI Proxy health");
    } catch (error) {
      failed = true;
      console.error(`FAIL AI Proxy health: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

if (failed) process.exit(1);
console.log("Cloudflare control-plane preflight passed without exposing credentials.");
