import {
  adminConfigured,
  authenticateAdmin,
  loginAdmin,
  logoutAdmin,
  requestHasSameOrigin,
  setupAdmin,
} from "./auth.js";
import { applicationPageFor, authPage, landingPageFor } from "./ui.js";

interface Env {
  DB: D1Database;
  AI_PROXY?: Fetcher;
  CONTROL_PLANE_URL: string;
  AGENT_GATEWAY_URL: string;
  AI_PROXY_URL: string;
  AI_ADMIN_TOKEN: string;
  OWNER_ID: string;
}

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: responseHeaders });
}

async function proxyAiAdmin(request: Request, env: Env, upstreamPath: string): Promise<Response> {
  const headers = new Headers({ authorization: `Bearer ${env.AI_ADMIN_TOKEN}` });
  if (request.headers.get("content-type")) headers.set("content-type", request.headers.get("content-type")!);
  const init: RequestInit = {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
  };
  const response = env.AI_PROXY
    ? await env.AI_PROXY.fetch(new Request(`https://ai-proxy.internal${upstreamPath}`, init))
    : await fetch(`${env.AI_PROXY_URL}${upstreamPath}`, init);
  return new Response(response.body, {
    status: response.status,
    headers: { ...responseHeaders, "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function connectionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `zao_${encoded}`;
}

export function createConnectCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const part = (offset: number) => [...bytes.slice(offset, offset + 4)]
    .map((byte) => alphabet[byte % alphabet.length]).join("");
  return `ZAO-${part(0)}-${part(4)}`;
}

async function listApps(env: Env) {
  const result = await env.DB.prepare(`SELECT a.id,a.slug,a.display_name,a.description,a.owner_id,e.id AS environment_id,e.name AS environment_name,
    d.status,d.url,d.sequence,d.updated_at FROM cloud_applications a JOIN cloud_environments e ON e.application_id=a.id
    LEFT JOIN cloud_deployments d ON d.id=e.active_deployment_id WHERE e.deleted_at IS NULL ORDER BY a.display_name`).all<Record<string, unknown>>();
  const output = [];
  for (const row of result.results) {
    const resources = await env.DB.prepare("SELECT kind FROM cloud_resources WHERE application_id=? AND environment_id=? ORDER BY kind")
      .bind(row.id, row.environment_id).all<{ kind: string }>();
    const versions = await env.DB.prepare("SELECT d.id,d.sequence,d.status,d.url,d.created_at,d.updated_at FROM cloud_deployments d WHERE d.environment_id=? ORDER BY d.sequence DESC LIMIT 5")
      .bind(row.environment_id).all();
    const policy = await env.DB.prepare("SELECT mode,allowed_groups_json FROM cloud_access_policies WHERE application_id=? AND environment_id=?")
      .bind(row.id, row.environment_id).first<{ mode: string; allowed_groups_json: string }>();
    output.push({
      application: { id: row.id, slug: row.slug, displayName: row.display_name, description: row.description, ownerId: row.owner_id },
      environment: { name: row.environment_name },
      deployment: row.url ? { status: row.status, url: row.url, sequence: row.sequence, updatedAt: row.updated_at } : null,
      access: policy ? { mode: policy.mode, allowedGroups: JSON.parse(policy.allowed_groups_json) } : null,
      resources: resources.results,
      recentDeployments: versions.results,
    });
  }
  return output;
}

async function listEvents(env: Env) {
  const result = await env.DB.prepare(
    "SELECT e.status,e.message,e.created_at,a.display_name FROM cloud_events e " +
    "LEFT JOIN cloud_deployments d ON d.id=e.deployment_id " +
    "LEFT JOIN cloud_applications a ON a.id=d.application_id " +
    "ORDER BY e.id DESC LIMIT 50",
  ).all<{ status: string; message: string; created_at: string; display_name: string | null }>();
  return result.results.map((row) => ({
    application: row.display_name,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
  }));
}

async function listAiUsage(env: Env) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  try {
    const days = await env.DB.prepare(
      "SELECT day,SUM(requests) AS requests,SUM(errors) AS errors," +
      "SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens " +
      "FROM ai_usage_daily WHERE day>=? GROUP BY day ORDER BY day DESC",
    ).bind(since).all<Record<string, unknown>>();
    const models = await env.DB.prepare(
      "SELECT model_alias,SUM(requests) AS requests,SUM(errors) AS errors," +
      "SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens " +
      "FROM ai_usage_daily WHERE day>=? GROUP BY model_alias ORDER BY requests DESC",
    ).bind(since).all<Record<string, unknown>>();
    return { available: true, days: days.results, models: models.results };
  } catch {
    // Installations migrated before usage rollups existed have no ai_usage_daily table yet.
    return { available: false, days: [], models: [] };
  }
}

export function buildAgentPrompt(code: string, env: Pick<Env, "AGENT_GATEWAY_URL">): string {
  return `请把当前项目部署到我的 EZdeploy 个人应用中心。

部署说明：
${env.AGENT_GATEWAY_URL}/agent.md

一次性连接码：
${code}

请先读取部署说明并分析当前项目，创建或更新 ezdeploy.yaml，然后向我展示简洁的部署计划，包括：
- 应用名称与运行时
- 需要的数据库、对象存储和 AI 能力
- 公开访问或受保护访问

我确认后，请按照说明完成构建、部署、自定义域激活和健康检查，并返回我的应用域名下可访问的正式应用链接。

在我确认部署计划之前，不要兑换连接码或开始部署。确认后必须使用计划返回的 planDigest，确保部署内容与我看到的计划一致。

不要把连接码或兑换得到的短期凭证写入项目文件、构建产物或最终回复。`;
}

export function buildPersistentAgentPrompt(key: string, env: Pick<Env, "AGENT_GATEWAY_URL">, locale: "zh" | "en" = "zh"): string {
  if (locale === "en") return `Install and configure the EZdeploy Deployment Skill for me. In the future, whenever I say “deploy to my app center”, “publish to EZdeploy”, “ship this app”, or anything similar, use this Skill directly.

Setup and deployment guide:
${env.AGENT_GATEWAY_URL}/agent.md

Skill:
${env.AGENT_GATEWAY_URL}/skill/ezdeploy-deploy/SKILL.md

My persistent deployment key:
${key}

Install the Skill in this agent's user-level Skill directory and store the API URL and key in the user-level credentials directory with current-user-only permissions. Never put the key in the project, source code, build output, logs, or final response.

After installation, tell me which trigger phrases are supported. For future deployments, analyze the project and show me the deployment plan first. Wait for my confirmation before building and publishing, then return the application URL only after its health check passes.`;
  return `请为我安装并配置 EZdeploy Deployment Skill。以后当我说“部署到应用中心”、“发布到 EZdeploy”、“上线这个应用”或意思相近的话时，直接使用这个 Skill。

安装与部署说明：
${env.AGENT_GATEWAY_URL}/agent.md

Skill：
${env.AGENT_GATEWAY_URL}/skill/ezdeploy-deploy/SKILL.md

我的长期部署 Key：
${key}

请把 Skill 安装到当前 Agent 的个人 Skill 目录，并把 API 地址与 Key 保存到用户级凭证目录；权限必须仅限当前用户。不要把 Key 写入项目、源码、构建产物、日志或最终回复。

安装完成后请告诉我已支持哪些触发语。以后部署时先分析项目并展示部署计划，等我确认后再构建和发布，最终返回健康检查通过的应用链接。`;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const locale: "zh" | "en" = url.pathname === "/en" || url.pathname.startsWith("/en/") ? "en" : "zh";
    const localizedPath = (path: string) => locale === "en" ? `/en${path}` : path;
    if (url.pathname === "/health") return json({ status: "ok", service: "ezdeploy-app-center" });
    if (["/", "/en"].includes(url.pathname)) return new Response(landingPageFor(locale), { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });

    if (url.pathname === "/api/auth/status" && request.method === "GET") {
      const admin = await authenticateAdmin(request, env);
      return json({ configured: await adminConfigured(env), authenticated: Boolean(admin), username: admin?.username });
    }
    if (["/setup", "/en/setup"].includes(url.pathname) && request.method === "GET") {
      if (await adminConfigured(env)) return Response.redirect(new URL(localizedPath("/login"), url), 302);
      return new Response(authPage("setup", locale), { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if (["/login", "/en/login"].includes(url.pathname) && request.method === "GET") {
      const admin = await authenticateAdmin(request, env);
      if (admin) return Response.redirect(new URL(localizedPath("/center"), url), 302);
      if (!await adminConfigured(env)) return Response.redirect(new URL(localizedPath("/setup"), url), 302);
      return new Response(authPage("login", locale), { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if (["/api/auth/setup", "/api/auth/login", "/api/auth/logout"].includes(url.pathname)) {
      if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);
      if (!requestHasSameOrigin(request)) return json({ error: { code: "FORBIDDEN", message: "Same-origin request required" } }, 403);
      if (url.pathname === "/api/auth/logout") {
        return new Response(JSON.stringify({ loggedOut: true }), {
          headers: { ...responseHeaders, "content-type": "application/json", "set-cookie": await logoutAdmin(request, env) },
        });
      }
      const input = await request.json<{ username?: string; password?: string; locale?: "zh" | "en" }>()
        .catch((): { username?: string; password?: string; locale?: "zh" | "en" } => ({}));
      const english = input.locale === "en";
      try {
        if (url.pathname === "/api/auth/setup") {
          const result = await setupAdmin(env, input.username?.trim() ?? "", input.password ?? "");
          return new Response(JSON.stringify({ username: result.admin.username }), {
            status: 201,
            headers: { ...responseHeaders, "content-type": "application/json", "set-cookie": result.setCookie },
          });
        }
        const result = await loginAdmin(request, env, input.username?.trim() ?? "", input.password ?? "");
        if (!result) return json({ error: { code: "INVALID_CREDENTIALS", message: english ? "Incorrect username or password" : "账号或密码不正确" } }, 401);
        return new Response(JSON.stringify({ username: result.admin.username }), {
          headers: { ...responseHeaders, "content-type": "application/json", "set-cookie": result.setCookie },
        });
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "认证失败";
        const rateLimited = rawMessage.includes("尝试过多");
        const message = english
          ? rawMessage.replace("尝试过多，请稍后再试", "Too many attempts. Try again later").replace("认证失败", "Authentication failed")
          : rawMessage;
        return json({ error: { code: rateLimited ? "RATE_LIMITED" : "AUTH_FAILED", message } }, rateLimited ? 429 : 400);
      }
    }

    const admin = await authenticateAdmin(request, env);
    if (!admin) {
      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(new URL(localizedPath(await adminConfigured(env) ? "/login" : "/setup"), url), 302);
      }
      return json({ error: { code: "UNAUTHORIZED", message: "Administrator login required" } }, 401);
    }
    if (!["GET", "HEAD"].includes(request.method) && !requestHasSameOrigin(request)) {
      return json({ error: { code: "FORBIDDEN", message: "Same-origin request required" } }, 403);
    }
    if (["/center", "/deploy", "/settings/ai", "/activity", "/en/center", "/en/deploy", "/en/settings/ai", "/en/activity"].includes(url.pathname)) {
      return new Response(applicationPageFor(locale), { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/apps") return json(await listApps(env));
    if (url.pathname === "/api/events") return json(await listEvents(env));
    if (url.pathname === "/api/ai-usage") return json(await listAiUsage(env));
    if (url.pathname === "/api/me") return json({ username: admin.username, administrator: true });
    if (url.pathname.startsWith("/api/ai/providers")) {
      return proxyAiAdmin(request, env, url.pathname.replace("/api/ai", "/admin/v1"));
    }

    if (url.pathname === "/api/connections" && request.method === "GET") {
      const rows = await env.DB.prepare(`SELECT id,label,created_at,last_used_at,expires_at,token_kind FROM cloud_agent_tokens
        WHERE owner_id=? AND active=1 AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC`)
        .bind(admin.ownerId, new Date().toISOString()).all<Record<string, unknown>>();
      return json(rows.results.map((row) => ({
        id: row.id, label: row.label, createdAt: row.created_at, lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at, kind: row.token_kind,
      })));
    }
    if (url.pathname === "/api/connect-codes" && request.method === "POST") {
      const input: { label?: string } = await request.json<{ label?: string }>().catch(() => ({}));
      const code = createConnectCode();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
      await env.DB.prepare(`INSERT INTO cloud_connect_codes
        (id,code_hash,owner_id,label,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(),
          await sha256(code),
          admin.ownerId,
          input.label?.slice(0, 80) || "Codex / WorkBuddy",
          expiresAt,
          createdAt,
        ).run();
      return json({
        connectCode: code,
        documentationUrl: `${env.AGENT_GATEWAY_URL}/agent.md`,
        agentPrompt: buildAgentPrompt(code, env),
        expiresAt,
      }, 201);
    }
    if (url.pathname === "/api/connections" && request.method === "POST") {
      const input: { label?: string; locale?: "zh" | "en" } = await request.json<{ label?: string; locale?: "zh" | "en" }>().catch(() => ({}));
      const count = await env.DB.prepare("SELECT count(*) AS value FROM cloud_agent_tokens WHERE owner_id=? AND active=1 AND token_kind='persistent'")
        .bind(admin.ownerId).first<{ value: number }>();
      if (Number(count?.value ?? 0) >= 5) return json({ error: { code: "LIMIT_REACHED", message: input.locale === "en" ? "You can keep up to 5 active connections. Revoke an old connection first" : "最多保留 5 个有效连接，请先撤销旧连接" } }, 409);
      const key = connectionKey();
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO cloud_agent_tokens
        (id,token_hash,owner_id,label,active,created_at,expires_at,token_kind,scopes_json)
        VALUES (?,?,?,?,1,?,NULL,'persistent',?)`)
        .bind(
          id,
          await sha256(key),
          admin.ownerId,
          input.label?.slice(0, 80) || "Codex / WorkBuddy",
          createdAt,
          JSON.stringify(["plan", "deploy", "read", "logs", "manage"]),
        ).run();
      return json({
        id,
        connectionKey: key,
        documentationUrl: `${env.AGENT_GATEWAY_URL}/agent.md`,
        skillUrl: `${env.AGENT_GATEWAY_URL}/skill/ezdeploy-deploy/SKILL.md`,
        agentPrompt: buildPersistentAgentPrompt(key, env, input.locale === "en" ? "en" : "zh"),
        createdAt,
        expiresAt: null,
      }, 201);
    }
    const match = /^\/api\/connections\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (match && request.method === "DELETE") {
      await env.DB.prepare("UPDATE cloud_agent_tokens SET active=0 WHERE id=? AND owner_id=?")
        .bind(match[1], admin.ownerId).run();
      return json({ id: match[1], revoked: true });
    }
    return json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
  },
} satisfies ExportedHandler<Env>;
