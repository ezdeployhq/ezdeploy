import { catalog, createDeployment, deploymentContext, setStatus } from "./db.js";
import { activate, addEvent, resources } from "./db.js";
import { createPagesRuntimeTail, deletePagesRuntimeTail, destroyApplicationResources, rollbackPages, verifyApplication } from "./cloudflare.js";
import type { DeploymentBundle, Environment, Manifest } from "./types.js";
export { DeploymentWorkflow } from "./workflow.js";

const securityHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: securityHeaders });

async function sha256(data: ArrayBuffer | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function authenticate(request: Request, env: Environment) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const [actual, expected] = await Promise.all([sha256(authorization.slice(7)), sha256(env.CONTROL_PLANE_TOKEN)]);
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < Math.min(actual.length, expected.length); index++) mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  if (mismatch === 0) return { ownerId: env.EMPLOYEE_OWNER_ID, administrator: true, scopes: ["*"] };
  const token = await env.DB.prepare(
    `SELECT id,owner_id,expires_at,scopes_json FROM cloud_agent_tokens
     WHERE token_hash=? AND active=1 AND (expires_at IS NULL OR expires_at>?)`,
  ).bind(actual, new Date().toISOString()).first<{
    id: string;
    owner_id: string;
    expires_at: string | null;
    scopes_json: string;
  }>();
  if (!token) return null;
  await env.DB.prepare("UPDATE cloud_agent_tokens SET last_used_at=? WHERE id=?")
    .bind(new Date().toISOString(), token.id).run();
  return {
    ownerId: token.owner_id,
    administrator: false,
    scopes: JSON.parse(token.scopes_json) as string[],
  };
}

function agentToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `zao_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

function hasScope(principal: { administrator: boolean; scopes: string[] }, scope: string) {
  return principal.administrator || principal.scopes.includes("*") || principal.scopes.includes(scope);
}

function validManifestApiVersion(value: unknown): value is Manifest["apiVersion"] {
  return value === "ezdeploy.io/v1alpha1" || value === "zaodeploy.io/v1alpha1";
}

function validBundle(value: unknown): value is DeploymentBundle {
  if (!value || typeof value !== "object") return false;
  const bundle = value as Partial<DeploymentBundle>;
  return bundle.version === 1 && validManifestApiVersion(bundle.manifest?.apiVersion) &&
    bundle.manifest?.kind === "Application" && Array.isArray(bundle.assets) && Array.isArray(bundle.migrations);
}

function validManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<Manifest>;
  return validManifestApiVersion(manifest.apiVersion) &&
    manifest.kind === "Application" &&
    typeof manifest.metadata?.name === "string" &&
    ["static", "vite", "cloudflare-workers"].includes(String(manifest.spec?.runtime)) &&
    Array.isArray(manifest.spec?.resources) &&
    ["public", "organization"].includes(String(manifest.spec?.access?.mode));
}

async function deploymentPlan(manifest: Manifest) {
  const planDigest = await sha256(JSON.stringify(manifest));
  const resourceKinds = manifest.spec.resources.map((resource) => resource.kind);
  return {
    planDigest,
    requiresConfirmation: true,
    provider: "cloudflare",
    application: {
      name: manifest.metadata.name,
      displayName: manifest.metadata.displayName ?? manifest.metadata.name,
    },
    runtime: manifest.spec.runtime,
    buildCommand: manifest.spec.buildCommand,
    outputDirectory: manifest.spec.outputDirectory,
    resources: manifest.spec.resources.map((resource) => ({
      kind: resource.kind,
      provider: resource.provider ?? (resource.kind === "ai" ? "zaodeploy-ai" : "cloudflare"),
      plan: resource.plan ?? "default",
    })),
    resourceRequests: manifest.spec.resources,
    access: manifest.spec.access,
    accessMode: manifest.spec.access.mode,
    healthCheck: manifest.spec.healthCheck,
    execution: "cloudflare-workflow",
    risks: [
      manifest.spec.access.mode === "public"
        ? "Application will be reachable without sign-in"
        : "Application will require protected access",
      ...(resourceKinds.length > 0
        ? [`The deployment will provision or bind: ${resourceKinds.join(", ")}`]
        : []),
    ],
  };
}

const landing = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EZdeploy 控制面</title><style>:root{font-family:Inter,system-ui;color:#effbf2;background:#07120b}body{margin:0;min-height:100vh;display:grid;place-items:center}.box{width:min(760px,calc(100% - 48px));padding:48px;border:1px solid #23452d;border-radius:24px;background:#0c1e12}h1{font-size:48px;margin:0 0 12px}.ok{color:#6ceb91}.links{display:flex;gap:12px;margin-top:28px}a{color:#07120b;background:#78ed9b;padding:11px 16px;border-radius:10px;text-decoration:none;font-weight:700}code{color:#9ff4b7}</style></head><body><main class="box"><div class="ok">● ONLINE</div><h1>EZdeploy 控制面</h1><p>个人应用中心的在线发布 API。构建由编码 Agent 完成，部署包进入 R2，状态写入 D1，并由 Cloudflare Workflow 完成发布、访问控制与健康检查。</p><p><code>POST /v1/deployments</code> · <code>GET /v1/apps</code> · <code>GET /v1/deployments/:id</code></p><div class="links"><a href="/health">运行状态</a><a href="${"APP_CENTER"}">应用中心</a></div></main></body></html>`;

async function runScheduledHealthChecks(env: Environment) {
  const rows = await env.DB.prepare(
    "SELECT d.id,d.url,d.manifest_json,a.display_name FROM cloud_deployments d " +
    "JOIN cloud_environments e ON e.active_deployment_id=d.id AND e.deleted_at IS NULL " +
    "JOIN cloud_applications a ON a.id=d.application_id " +
    "WHERE d.status='ready' AND d.url IS NOT NULL LIMIT 50",
  ).all<{ id: string; url: string; manifest_json: string; display_name: string }>();
  await Promise.all(rows.results.map(async (row) => {
    try {
      await verifyApplication(env, row.url, JSON.parse(row.manifest_json) as Manifest);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await addEvent(env, row.id, "unhealthy", "Scheduled health check failed", { errorMessage: message });
    }
  }));
}

export default {
  async scheduled(_controller: ScheduledController, env: Environment, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduledHealthChecks(env));
  },
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(landing.replace("APP_CENTER", env.APP_CENTER_URL), { headers: { "content-type": "text/html; charset=utf-8", ...securityHeaders } });
      }
      if (request.method === "GET" && url.pathname === "/health") return json({ status: "ok", service: "zaodeploy-control-plane" });
      if (request.method === "POST" && url.pathname === "/v1/connect/plan") {
        if (request.headers.get("x-zaodeploy-agent-ingress") !== "1") {
          return json({ error: { code: "FORBIDDEN", message: "Connection codes may only be used through the Agent API" } }, 403);
        }
        const input: { code?: string; manifest?: unknown } =
          await request.json<{ code?: string; manifest?: unknown }>().catch(() => ({}));
        const code = input.code?.trim().toUpperCase();
        if (!code || !/^ZAO-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
          return json({ error: { code: "INVALID_CONNECT_CODE", message: "A valid EZdeploy connection code is required" } }, 400);
        }
        if (!validManifest(input.manifest)) {
          return json({ error: { code: "MANIFEST_INVALID", message: "A valid EZdeploy manifest is required" } }, 400);
        }
        const pending = await env.DB.prepare(
          `SELECT id,expires_at FROM cloud_connect_codes
           WHERE code_hash=? AND redeemed_at IS NULL AND expires_at>?`,
        ).bind(await sha256(code), new Date().toISOString()).first<{
          id: string;
          expires_at: string;
        }>();
        if (!pending) {
          return json({ error: { code: "CONNECT_CODE_EXPIRED", message: "Connection code is invalid, expired, or already used" } }, 401);
        }
        return json({
          ...await deploymentPlan(input.manifest),
          connectCodeExpiresAt: pending.expires_at,
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/connect/exchange") {
        if (request.headers.get("x-zaodeploy-agent-ingress") !== "1") {
          return json({ error: { code: "FORBIDDEN", message: "Connection codes may only be exchanged through the Agent API" } }, 403);
        }
        const input: { code?: string; label?: string } =
          await request.json<{ code?: string; label?: string }>().catch(() => ({}));
        const code = input.code?.trim().toUpperCase();
        if (!code || !/^ZAO-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
          return json({ error: { code: "INVALID_CONNECT_CODE", message: "A valid EZdeploy connection code is required" } }, 400);
        }
        const timestamp = new Date().toISOString();
        const codeHash = await sha256(code);
        const pending = await env.DB.prepare(
          `SELECT id,owner_id,label,expires_at FROM cloud_connect_codes
           WHERE code_hash=? AND redeemed_at IS NULL AND expires_at>?`,
        ).bind(codeHash, timestamp).first<{
          id: string;
          owner_id: string;
          label: string | null;
          expires_at: string;
        }>();
        if (!pending) {
          return json({ error: { code: "CONNECT_CODE_EXPIRED", message: "Connection code is invalid, expired, or already used" } }, 401);
        }
        const redeemed = await env.DB.prepare(
          "UPDATE cloud_connect_codes SET redeemed_at=? WHERE id=? AND redeemed_at IS NULL",
        ).bind(timestamp, pending.id).run();
        if (redeemed.meta.changes !== 1) {
          return json({ error: { code: "CONNECT_CODE_USED", message: "Connection code has already been used" } }, 409);
        }
        const plaintext = agentToken();
        const expiresAt = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
        await env.DB.prepare(
          `INSERT INTO cloud_agent_tokens
           (id,token_hash,owner_id,label,active,created_at,expires_at,token_kind,scopes_json)
           VALUES (?,?,?,?,1,?,?,?,?)`,
        ).bind(
          crypto.randomUUID(),
          await sha256(plaintext),
          pending.owner_id,
          input.label?.slice(0, 80) || pending.label || "Zero-install Agent session",
          timestamp,
          expiresAt,
          "session",
          JSON.stringify(["plan", "deploy", "read", "logs"]),
        ).run();
        return json({
          connectionKey: plaintext,
          ownerId: pending.owner_id,
          expiresAt,
          scopes: ["plan", "deploy", "read", "logs"],
        }, 201);
      }
      const principal = await authenticate(request, env);
      if (!principal) return json({ error: { code: "UNAUTHORIZED", message: "Valid Agent Gateway token required" } }, 401);
      if (request.method === "POST" && url.pathname === "/v1/admin/tokens") {
        if (!principal.administrator) return json({ error: { code: "FORBIDDEN", message: "Administrator token required" } }, 403);
        const input = await request.json<{ ownerId?: string; label?: string }>();
        if (!input.ownerId) return json({ error: { code: "INVALID_REQUEST", message: "ownerId is required" } }, 400);
        const plaintext = agentToken();
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO cloud_agent_tokens (id,token_hash,owner_id,label,created_at) VALUES (?,?,?,?,?)",
        ).bind(id, await sha256(plaintext), input.ownerId, input.label ?? null, new Date().toISOString()).run();
        return json({ id, ownerId: input.ownerId, token: plaintext }, 201);
      }
      const tokenMatch = /^\/v1\/admin\/tokens\/([0-9a-f-]{36})$/.exec(url.pathname);
      if (request.method === "DELETE" && tokenMatch) {
        if (!principal.administrator) return json({ error: { code: "FORBIDDEN", message: "Administrator token required" } }, 403);
        await env.DB.prepare("UPDATE cloud_agent_tokens SET active=0 WHERE id=?").bind(tokenMatch[1]).run();
        return json({ id: tokenMatch[1], revoked: true });
      }
      if (request.method === "POST" && url.pathname === "/v1/plan") {
        if (!hasScope(principal, "plan")) return json({ error: { code: "FORBIDDEN", message: "Token cannot plan deployments" } }, 403);
        const manifest = await request.json<Manifest>();
        if (!validManifest(manifest)) {
          return json({ error: { code: "MANIFEST_INVALID", message: "A valid EZdeploy manifest is required" } }, 400);
        }
        return json(await deploymentPlan(manifest));
      }
      if (request.method === "POST" && url.pathname === "/v1/deployments") {
        if (!hasScope(principal, "deploy")) return json({ error: { code: "FORBIDDEN", message: "Token cannot create deployments" } }, 403);
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 25 * 1024 * 1024) return json({ error: { code: "BUNDLE_TOO_LARGE", message: "Bundle exceeds 25 MiB" } }, 413);
        const digest = await sha256(bytes);
        if (request.headers.get("x-zaodeploy-source-sha256") !== digest) return json({ error: { code: "DIGEST_MISMATCH", message: "Bundle digest mismatch" } }, 400);
        const bundle = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
        if (!validBundle(bundle)) return json({ error: { code: "MANIFEST_INVALID", message: "Invalid cloud deployment bundle" } }, 400);
        const confirmedPlanDigest = request.headers.get("x-zaodeploy-plan-digest");
        const actualPlanDigest = await sha256(JSON.stringify(bundle.manifest));
        if (!confirmedPlanDigest || confirmedPlanDigest !== actualPlanDigest) {
          return json({
            error: {
              code: "PLAN_CONFIRMATION_REQUIRED",
              message: "Generate a deployment plan, obtain user confirmation, and submit its planDigest",
            },
          }, 409);
        }
        const environmentName = url.searchParams.get("environment") ?? "production";
        const artifactKey = `deployments/${crypto.randomUUID()}.json`;
        await env.SOURCES.put(artifactKey, bytes, { httpMetadata: { contentType: "application/vnd.zaodeploy.bundle+json" }, customMetadata: { digest } });
        let deployment;
        try {
          deployment = await createDeployment(env, principal.ownerId, environmentName, bundle.manifest, artifactKey, digest);
          await env.DEPLOY_WORKFLOW.create({ id: deployment.id, params: { deploymentId: deployment.id } });
        } catch (error) {
          await env.SOURCES.delete(artifactKey);
          throw error;
        }
        return json({ ...deployment, pollUrl: `/v1/deployments/${deployment.id}` }, 202);
      }
      if (request.method === "GET" && url.pathname === "/v1/apps") {
        if (!hasScope(principal, "read")) return json({ error: { code: "FORBIDDEN", message: "Token cannot read the application catalog" } }, 403);
        return json(await catalog(env));
      }
      const deploymentMatch = /^\/v1\/deployments\/([0-9a-f-]{36})(?:\/(logs|rollback))?$/.exec(url.pathname);
      if (deploymentMatch) {
        const id = deploymentMatch[1];
        const target = await deploymentContext(env, id);
        if (!principal.administrator && target.owner_id !== principal.ownerId) {
          return json({ error: { code: "FORBIDDEN", message: "Only the owner or an administrator can manage this deployment" } }, 403);
        }
        if (request.method === "GET" && !deploymentMatch[2]) {
          if (!hasScope(principal, "read")) return json({ error: { code: "FORBIDDEN", message: "Token cannot read deployments" } }, 403);
          return json(target);
        }
        if (request.method === "GET" && deploymentMatch[2] === "logs") {
          if (!hasScope(principal, "logs")) return json({ error: { code: "FORBIDDEN", message: "Token cannot read logs" } }, 403);
          const events = await env.DB.prepare("SELECT status,message,details_json,created_at FROM cloud_events WHERE deployment_id=? ORDER BY id")
            .bind(id).all();
          let runtimeSession: { id: string; url: string } | null = null;
          if (target.provider_deployment_id) {
            runtimeSession = await createPagesRuntimeTail(
              env,
              `zao-${target.slug}-${target.environment_name}`,
              String(target.provider_deployment_id),
            );
          }
          return json({ events: events.results, runtimeSession });
        }
        if (request.method === "DELETE" && deploymentMatch[2] === "logs") {
          const tailId = url.searchParams.get("tailId");
          if (!tailId || !/^[0-9a-f]{32}$/.test(tailId)) {
            return json({ error: { code: "INVALID_REQUEST", message: "Valid tailId is required" } }, 400);
          }
          if (target.provider_deployment_id) {
            await deletePagesRuntimeTail(
              env,
              `zao-${target.slug}-${target.environment_name}`,
              String(target.provider_deployment_id),
              tailId,
            );
          }
          return json({ tailId, deleted: true });
        }
        if (request.method === "POST" && deploymentMatch[2] === "rollback") {
          if (!hasScope(principal, "manage")) return json({ error: { code: "FORBIDDEN", message: "A persistent management connection is required for rollback" } }, 403);
          if (!target.provider_deployment_id) return json({ error: { code: "ROLLBACK_UNAVAILABLE", message: "Deployment has no provider release" } }, 409);
          const projectName = `zao-${target.slug}-${target.environment_name}`;
          await rollbackPages(env, projectName, String(target.provider_deployment_id));
          await activate(env, String(target.environment_id), id);
          await addEvent(env, id, "ready", "Deployment restored by rollback");
          return json({ deploymentId: id, rolledBack: true, url: target.url });
        }
        if (request.method === "DELETE" && !deploymentMatch[2]) {
          if (!hasScope(principal, "manage")) return json({ error: { code: "FORBIDDEN", message: "A persistent management connection is required for deletion" } }, 403);
          const environment = await env.DB.prepare(
            "SELECT active_deployment_id FROM cloud_environments WHERE id=?",
          ).bind(target.environment_id).first<{ active_deployment_id: string | null }>();
          const removeResources = url.searchParams.get("removeResources") === "true";
          if (environment?.active_deployment_id === id && !removeResources) {
            return json({ error: { code: "ACTIVE_DEPLOYMENT", message: "Set removeResources=true to remove the active application and its resources" } }, 409);
          }
          if (removeResources) {
            const projectName = `zao-${target.slug}-${target.environment_name}`;
            const bound = await resources(env, String(target.application_id), String(target.environment_id));
            await destroyApplicationResources(
              env,
              projectName,
              String(target.slug),
              String(target.environment_name),
              bound,
            );
            const artifacts = await env.DB.prepare(
              "SELECT artifact_key FROM cloud_deployments WHERE environment_id=?",
            ).bind(target.environment_id).all<{ artifact_key: string }>();
            await Promise.all(artifacts.results.map((item) => env.SOURCES.delete(item.artifact_key)));
            await env.DB.batch([
              env.DB.prepare("DELETE FROM cloud_resources WHERE environment_id=?").bind(target.environment_id),
              env.DB.prepare("UPDATE cloud_environments SET active_deployment_id=NULL,deleted_at=? WHERE id=?")
                .bind(new Date().toISOString(), target.environment_id),
              env.DB.prepare("UPDATE cloud_deployments SET status='deleted',updated_at=? WHERE environment_id=?")
                .bind(new Date().toISOString(), target.environment_id),
            ]);
            return json({ deploymentId: id, deleted: true, resourcesRemoved: true });
          }
          await setStatus(env, id, "deleted", "Deployment record deleted");
          await env.SOURCES.delete(String(target.artifact_key));
          return json({ deploymentId: id, deleted: true });
        }
      }
      return json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
    } catch (error) {
      return json({ error: { code: "CONTROL_PLANE_ERROR", message: error instanceof Error ? error.message : String(error) } }, 500);
    }
  },
} satisfies ExportedHandler<Environment>;
