import type { AiCredentialStore } from "./types.js";
import { decryptProviderKey, encryptProviderKey } from "./provider-crypto.js";
import type { AiProvider, AiProviderStore } from "./provider-store.js";

export interface AiProxyEnvironment {
  AI_GATEWAY_BASE_URL: string;
  AI_GATEWAY_TOKEN: string;
  AI_GATEWAY_ID?: string;
  CONTROL_PLANE_TOKEN: string;
  MODEL_ALIASES: string;
  AI_PROVIDER_ENCRYPTION_KEY?: string;
}

export interface AiProxyDependencies {
  store: AiCredentialStore;
  providers?: AiProviderStore;
  environment: AiProxyEnvironment;
  fetch?: typeof globalThis.fetch;
}

const supportedEndpoints = new Set(["/v1/chat/completions", "/v1/embeddings"]);
const maxRequestBytes = 1_048_576;

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createVirtualKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `zai_${encoded}`;
}

function aliases(environment: AiProxyEnvironment): Record<string, string> {
  const parsed = JSON.parse(environment.MODEL_ALIASES) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MODEL_ALIASES must be a JSON object");
  }
  return parsed as Record<string, string>;
}

export function createAiProxyHandler(dependencies: AiProxyDependencies) {
  const fetcher = dependencies.fetch ?? globalThis.fetch;

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ status: "ok" });
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EZdeploy AI Gateway</title><style>:root{font-family:Inter,system-ui;color:#eefaf1;background:#07120b}body{min-height:100vh;margin:0;display:grid;place-items:center}.box{max-width:680px;margin:24px;padding:44px;border:1px solid #285034;border-radius:22px;background:#0d2013}h1{font-size:46px;margin:8px 0}.ok{color:#72ed98;font-weight:800}code{color:#9af0b3}</style></head><body><main class="box"><div class="ok">● ONLINE</div><h1>企业 AI Gateway</h1><p>由 EZdeploy 为每个应用签发独立的 <code>zai_</code> 凭证，统一完成模型路由、限流和用量审计。</p><p>兼容接口：<code>/v1/chat/completions</code>、<code>/v1/embeddings</code>、<code>/v1/models</code></p></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }

    if (url.pathname === "/admin/v1/credentials" && request.method === "POST") {
      return createCredential(request, dependencies);
    }
    if (url.pathname.startsWith("/admin/v1/credentials/") && request.method === "DELETE") {
      return revokeCredential(request, url.pathname.split("/").at(-1) ?? "", dependencies);
    }
    if (url.pathname === "/admin/v1/providers" && request.method === "GET") {
      return listProviders(request, dependencies);
    }
    if (url.pathname === "/admin/v1/providers" && request.method === "POST") {
      return saveProvider(request, null, dependencies);
    }
    const providerMatch = /^\/admin\/v1\/providers\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (providerMatch && request.method === "PUT") {
      return saveProvider(request, providerMatch[1], dependencies);
    }
    if (providerMatch && request.method === "DELETE") {
      return removeProvider(request, providerMatch[1], dependencies);
    }
    const providerTestMatch = /^\/admin\/v1\/providers\/([0-9a-f-]{36})\/test$/.exec(url.pathname);
    if (providerTestMatch && request.method === "POST") {
      return testProvider(request, providerTestMatch[1], dependencies);
    }

    const modelAliases = aliases(dependencies.environment);
    if (url.pathname === "/v1/models" && request.method === "GET") {
      const credential = await authorize(request, dependencies.store);
      if (credential instanceof Response) return credential;
      return json({
        object: "list",
        data: Object.keys(modelAliases)
          .filter((model) => credential.allowedModels.includes(model))
          .map((id) => ({ id, object: "model", owned_by: "zaodeploy" })),
      });
    }

    if (request.method !== "POST" || !supportedEndpoints.has(url.pathname)) {
      return json({ error: { code: "not_found", message: "Endpoint not found" } }, 404);
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > maxRequestBytes) {
      return json({ error: { code: "request_too_large", message: "Request exceeds 1 MiB" } }, 413);
    }

    const credential = await authorize(request, dependencies.store);
    if (credential instanceof Response) return credential;
    const since = new Date(Date.now() - 60_000).toISOString();
    if (
      (await dependencies.store.countRecentRequests(credential.appId, since)) >=
      credential.requestsPerMinute
    ) {
      return json({ error: { code: "rate_limited", message: "Application AI limit exceeded" } }, 429);
    }

    let body: Record<string, unknown>;
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > maxRequestBytes) {
        return json({ error: { code: "request_too_large", message: "Request exceeds 1 MiB" } }, 413);
      }
      body = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    } catch {
      return json({ error: { code: "invalid_json", message: "Request body must be JSON" } }, 400);
    }
    const modelAlias = typeof body.model === "string" ? body.model : "";
    if (!credential.allowedModels.includes(modelAlias)) {
      return json({ error: { code: "model_forbidden", message: "Model is not allowed" } }, 403);
    }
    let upstreamModel = modelAliases[modelAlias];
    if (!upstreamModel) {
      return json({ error: { code: "model_unavailable", message: "Model alias is unavailable" } }, 503);
    }

    let upstreamBase = dependencies.environment.AI_GATEWAY_BASE_URL.replace(/\/$/, "");
    let upstreamToken = dependencies.environment.AI_GATEWAY_TOKEN;
    let providerId = "cloudflare-workers-ai";
    const configuredProvider = url.pathname === "/v1/chat/completions"
      ? await dependencies.providers?.getDefault()
      : null;
    if (configuredProvider) {
      if (!dependencies.environment.AI_PROVIDER_ENCRYPTION_KEY) {
        return json({ error: { code: "provider_configuration_error", message: "Provider encryption key is unavailable" } }, 503);
      }
      upstreamBase = configuredProvider.baseUrl.replace(/\/$/, "");
      upstreamToken = await decryptProviderKey(
        configuredProvider.apiKeyCiphertext,
        configuredProvider.apiKeyIv,
        dependencies.environment.AI_PROVIDER_ENCRYPTION_KEY,
      );
      upstreamModel = configuredProvider.defaultModel;
      providerId = configuredProvider.id;
    }
    const upstreamPath = url.pathname.slice(3);
    const upstreamHeaders = new Headers({
      authorization: `Bearer ${upstreamToken}`,
      "content-type": "application/json",
      accept: request.headers.get("accept") ?? "application/json",
    });
    if (!configuredProvider && dependencies.environment.AI_GATEWAY_ID) {
      upstreamHeaders.set("cf-aig-gateway-id", dependencies.environment.AI_GATEWAY_ID);
    }
    const upstreamResponse = await fetcher(`${upstreamBase}${upstreamPath}`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({ ...body, model: upstreamModel }),
    });

    await dependencies.store.recordUsage({
      credentialId: credential.id,
      appId: credential.appId,
      modelAlias,
      upstreamModel,
      endpoint: url.pathname,
      statusCode: upstreamResponse.status,
      createdAt: new Date().toISOString(),
    });

    const headers = new Headers(upstreamResponse.headers);
    headers.set("cache-control", "no-store");
    headers.set("x-zaodeploy-ai-provider", providerId);
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers,
    });
  };
}

function authorizedAdmin(request: Request, dependencies: AiProxyDependencies): Response | null {
  if (bearerToken(request) !== dependencies.environment.CONTROL_PLANE_TOKEN) {
    return json({ error: { code: "unauthorized", message: "Control-plane token required" } }, 401);
  }
  if (!dependencies.providers || !dependencies.environment.AI_PROVIDER_ENCRYPTION_KEY) {
    return json({ error: { code: "provider_management_unavailable", message: "Provider management is not configured" } }, 503);
  }
  return null;
}

function publicProvider(provider: AiProvider) {
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    apiKeyConfigured: true,
    apiKeyLastFour: provider.apiKeyLastFour,
    defaultModel: provider.defaultModel,
    models: provider.models,
    enabled: provider.enabled,
    isDefault: provider.isDefault,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    lastTestStatus: provider.lastTestStatus,
    lastTestMessage: provider.lastTestMessage,
    lastTestAt: provider.lastTestAt,
  };
}

async function listProviders(request: Request, dependencies: AiProxyDependencies) {
  const denied = authorizedAdmin(request, dependencies);
  if (denied) return denied;
  return json((await dependencies.providers!.list()).map(publicProvider));
}

async function saveProvider(request: Request, id: string | null, dependencies: AiProxyDependencies) {
  const denied = authorizedAdmin(request, dependencies);
  if (denied) return denied;
  type ProviderInput = {
    name?: string;
    providerType?: string;
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    models?: string[];
    enabled?: boolean;
    isDefault?: boolean;
  };
  const input = await request.json<ProviderInput>().catch((): ProviderInput => ({}));
  if (
    !input.name?.trim() || !input.providerType?.trim() || !input.baseUrl?.trim() ||
    !input.defaultModel?.trim() || !Array.isArray(input.models)
  ) {
    return json({ error: { code: "invalid_request", message: "名称、类型、Base URL 和默认模型不能为空" } }, 400);
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.baseUrl);
    if (parsedUrl.protocol !== "https:") throw new Error("HTTPS required");
  } catch {
    return json({ error: { code: "invalid_base_url", message: "Base URL 必须是有效的 HTTPS 地址" } }, 400);
  }
  const existing = id ? await dependencies.providers!.get(id) : null;
  if (id && !existing) return json({ error: { code: "not_found", message: "Provider 不存在" } }, 404);
  if (!input.apiKey?.trim() && !existing) {
    return json({ error: { code: "api_key_required", message: "API Key 不能为空" } }, 400);
  }
  const encrypted = input.apiKey?.trim()
    ? await encryptProviderKey(input.apiKey.trim(), dependencies.environment.AI_PROVIDER_ENCRYPTION_KEY!)
    : {
        ciphertext: existing!.apiKeyCiphertext,
        iv: existing!.apiKeyIv,
        lastFour: existing!.apiKeyLastFour,
      };
  const models = [...new Set([...input.models, input.defaultModel].map((model) => model.trim()).filter(Boolean))];
  const saved = await dependencies.providers!.save({
    id: id ?? crypto.randomUUID(),
    name: input.name.trim().slice(0, 80),
    providerType: input.providerType.trim().slice(0, 40),
    baseUrl: parsedUrl.toString().replace(/\/$/, ""),
    apiKeyCiphertext: encrypted.ciphertext,
    apiKeyIv: encrypted.iv,
    apiKeyLastFour: encrypted.lastFour,
    defaultModel: input.defaultModel.trim().slice(0, 160),
    models: models.slice(0, 100),
    enabled: input.enabled !== false,
    isDefault: input.isDefault === true,
  });
  return json(publicProvider(saved), id ? 200 : 201);
}

async function removeProvider(request: Request, id: string, dependencies: AiProxyDependencies) {
  const denied = authorizedAdmin(request, dependencies);
  if (denied) return denied;
  return (await dependencies.providers!.remove(id))
    ? json({ id, deleted: true })
    : json({ error: { code: "not_found", message: "Provider 不存在" } }, 404);
}

async function testProvider(request: Request, id: string, dependencies: AiProxyDependencies) {
  const denied = authorizedAdmin(request, dependencies);
  if (denied) return denied;
  const provider = await dependencies.providers!.get(id);
  if (!provider) return json({ error: { code: "not_found", message: "Provider 不存在" } }, 404);
  try {
    const apiKey = await decryptProviderKey(
      provider.apiKeyCiphertext,
      provider.apiKeyIv,
      dependencies.environment.AI_PROVIDER_ENCRYPTION_KEY!,
    );
    const response = await (dependencies.fetch ?? globalThis.fetch)(
      `${provider.baseUrl.replace(/\/$/, "")}/models`,
      { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } },
    );
    const message = response.ok
      ? `连接成功（HTTP ${response.status}）`
      : `Provider 返回 HTTP ${response.status}`;
    await dependencies.providers!.recordTest(id, response.ok ? "ready" : "failed", message);
    return json({ ok: response.ok, status: response.status, message }, response.ok ? 200 : 422);
  } catch (error) {
    const message = error instanceof Error ? error.message : "连接失败";
    await dependencies.providers!.recordTest(id, "failed", message);
    return json({ ok: false, message }, 422);
  }
}

async function authorize(request: Request, store: AiCredentialStore) {
  const token = bearerToken(request);
  if (!token?.startsWith("zai_")) {
    return json({ error: { code: "unauthorized", message: "Invalid application key" } }, 401);
  }
  const credential = await store.findByKeyHash(await sha256(token));
  if (!credential?.active) {
    return json({ error: { code: "unauthorized", message: "Invalid application key" } }, 401);
  }
  return credential;
}

async function createCredential(
  request: Request,
  dependencies: AiProxyDependencies,
): Promise<Response> {
  if (bearerToken(request) !== dependencies.environment.CONTROL_PLANE_TOKEN) {
    return json({ error: { code: "unauthorized", message: "Control-plane token required" } }, 401);
  }
  const body = (await request.json()) as {
    appId?: string;
    allowedModels?: string[];
    requestsPerMinute?: number;
  };
  if (!body.appId || !Array.isArray(body.allowedModels) || body.allowedModels.length === 0) {
    return json({ error: { code: "invalid_request", message: "appId and allowedModels required" } }, 400);
  }
  const available = aliases(dependencies.environment);
  if (body.allowedModels.some((model) => !available[model])) {
    return json({ error: { code: "invalid_model", message: "Unknown model alias" } }, 400);
  }
  const virtualKey = createVirtualKey();
  const id = crypto.randomUUID();
  await dependencies.store.create({
    id,
    appId: body.appId,
    keyHash: await sha256(virtualKey),
    allowedModels: body.allowedModels,
    requestsPerMinute: Math.max(1, Math.min(body.requestsPerMinute ?? 60, 10_000)),
  });
  return json({ credentialId: id, virtualKey }, 201);
}

async function revokeCredential(
  request: Request,
  id: string,
  dependencies: AiProxyDependencies,
): Promise<Response> {
  if (bearerToken(request) !== dependencies.environment.CONTROL_PLANE_TOKEN) {
    return json({ error: { code: "unauthorized", message: "Control-plane token required" } }, 401);
  }
  return (await dependencies.store.revoke(id))
    ? json({ credentialId: id, revoked: true })
    : json({ error: { code: "not_found", message: "Credential not found" } }, 404);
}
