import { describe, expect, it } from "vitest";
import { createAiProxyHandler, type AiProxyEnvironment } from "./handler.js";
import type {
  AiCredential,
  AiCredentialStore,
  CreateCredentialInput,
  UsageRecord,
} from "./types.js";
import type { AiProvider, AiProviderStore, SaveAiProvider } from "./provider-store.js";

class MemoryStore implements AiCredentialStore {
  credentials = new Map<string, AiCredential>();
  usage: UsageRecord[] = [];

  async create(input: CreateCredentialInput): Promise<void> {
    this.credentials.set(input.keyHash, {
      ...input,
      dailyRequestBudget: input.dailyRequestBudget ?? null,
      active: true,
    });
  }

  async findByKeyHash(keyHash: string): Promise<AiCredential | null> {
    return this.credentials.get(keyHash) ?? null;
  }

  async revoke(id: string): Promise<boolean> {
    const credential = [...this.credentials.values()].find((candidate) => candidate.id === id);
    if (!credential?.active) return false;
    credential.active = false;
    return true;
  }

  async minuteCount(appId: string, minute: string): Promise<number> {
    return this.usage.filter((record) => record.appId === appId && record.minute === minute).length;
  }

  async dailyRequestTotal(appId: string, day: string): Promise<number> {
    return this.usage.filter((record) => record.appId === appId && record.day === day).length;
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    this.usage.push(record);
  }
}

class MemoryProviderStore implements AiProviderStore {
  providers = new Map<string, AiProvider>();

  async list() { return [...this.providers.values()]; }
  async get(id: string) { return this.providers.get(id) ?? null; }
  async getDefault() {
    return [...this.providers.values()].find((provider) => provider.enabled && provider.isDefault) ??
      [...this.providers.values()].find((provider) => provider.enabled) ?? null;
  }
  async save(input: SaveAiProvider) {
    if (input.isDefault) {
      for (const provider of this.providers.values()) provider.isDefault = false;
    }
    const timestamp = new Date().toISOString();
    const provider: AiProvider = {
      ...input,
      createdAt: this.providers.get(input.id)?.createdAt ?? timestamp,
      updatedAt: timestamp,
      lastTestStatus: null,
      lastTestMessage: null,
      lastTestAt: null,
    };
    this.providers.set(input.id, provider);
    return provider;
  }
  async remove(id: string) { return this.providers.delete(id); }
  async recordTest(id: string, status: "ready" | "failed", message: string) {
    const provider = this.providers.get(id);
    if (provider) {
      provider.lastTestStatus = status;
      provider.lastTestMessage = message;
      provider.lastTestAt = new Date().toISOString();
    }
  }
}

const environment: AiProxyEnvironment = {
  AI_GATEWAY_BASE_URL: "https://gateway.example.test/ai/v1",
  AI_GATEWAY_TOKEN: "real-provider-key",
  AI_GATEWAY_ID: "default",
  CONTROL_PLANE_TOKEN: "control-token",
  MODEL_ALIASES: JSON.stringify({
    "default-chat": "@cf/openai/gpt-oss-120b",
    embedding: "@cf/baai/bge-large-en-v1.5",
  }),
  AI_PROVIDER_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

async function issueCredential(
  handler: (request: Request) => Promise<Response>,
  overrides: Record<string, unknown> = {},
) {
  const response = await handler(
    new Request("https://ai.example.test/admin/v1/credentials", {
      method: "POST",
      headers: {
        authorization: "Bearer control-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        appId: "app-123",
        allowedModels: ["default-chat"],
        requestsPerMinute: 2,
        ...overrides,
      }),
    }),
  );
  expect(response.status).toBe(201);
  return response.json<{ credentialId: string; virtualKey: string }>();
}

describe("EZdeploy AI Proxy", () => {
  it("issues a scoped key and rewrites an allowed model alias without logging prompts", async () => {
    const store = new MemoryStore();
    let upstreamBody: Record<string, unknown> | undefined;
    let upstreamAuthorization: string | null = null;
    let upstreamGatewayId: string | null = null;
    const handler = createAiProxyHandler({
      store,
      environment,
      fetch: async (_input, init) => {
        upstreamBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        upstreamAuthorization = new Headers(init?.headers).get("authorization");
        upstreamGatewayId = new Headers(init?.headers).get("cf-aig-gateway-id");
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      },
    });
    const credential = await issueCredential(handler);

    const response = await handler(
      new Request("https://ai.example.test/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.virtualKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "default-chat",
          messages: [{ role: "user", content: "confidential prompt" }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(upstreamBody?.model).toBe("@cf/openai/gpt-oss-120b");
    expect(upstreamAuthorization).toBe("Bearer real-provider-key");
    expect(upstreamGatewayId).toBe("default");
    expect(store.usage).toHaveLength(1);
    expect(JSON.stringify(store.usage)).not.toContain("confidential prompt");
    expect(JSON.stringify(store.credentials)).not.toContain(credential.virtualKey);
  });

  it("rejects an oversized body even when content-length is absent", async () => {
    const store = new MemoryStore();
    const handler = createAiProxyHandler({ store, environment, fetch: async () => Response.json({}) });
    const credential = await issueCredential(handler);
    const response = await handler(new Request("https://ai.example.test/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${credential.virtualKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "default-chat", message: "x".repeat(1_048_576) }),
    }));
    expect(response.status).toBe(413);
  });

  it("blocks unapproved models and enforces the application rate limit", async () => {
    const store = new MemoryStore();
    const handler = createAiProxyHandler({
      store,
      environment,
      fetch: async () => Response.json({ ok: true }),
    });
    const credential = await issueCredential(handler, { requestsPerMinute: 1 });
    const request = (model: string) =>
      new Request("https://ai.example.test/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${credential.virtualKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, messages: [] }),
      });

    expect((await handler(request("embedding"))).status).toBe(403);
    expect((await handler(request("default-chat"))).status).toBe(200);
    expect((await handler(request("default-chat"))).status).toBe(429);
  });

  it("never accepts the control-plane credential as an application key", async () => {
    const handler = createAiProxyHandler({
      store: new MemoryStore(),
      environment,
      fetch: async () => Response.json({ ok: true }),
    });

    const response = await handler(
      new Request("https://ai.example.test/v1/models", {
        headers: { authorization: "Bearer control-token" },
      }),
    );
    expect(response.status).toBe(401);
  });

  it("records token usage from JSON upstream responses", async () => {
    const store = new MemoryStore();
    const handler = createAiProxyHandler({
      store,
      environment,
      fetch: async () =>
        Response.json({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 7 } }),
    });
    const credential = await issueCredential(handler);
    const response = await handler(
      new Request("https://ai.example.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${credential.virtualKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "default-chat", messages: [] }),
      }),
    );
    expect(response.status).toBe(200);
    expect(store.usage).toHaveLength(1);
    expect(store.usage[0].inputTokens).toBe(12);
    expect(store.usage[0].outputTokens).toBe(7);
  });

  it("enforces the daily request budget before calling the provider", async () => {
    const store = new MemoryStore();
    let upstreamCalls = 0;
    const handler = createAiProxyHandler({
      store,
      environment,
      fetch: async () => {
        upstreamCalls += 1;
        return Response.json({ ok: true });
      },
    });
    const credential = await issueCredential(handler, { requestsPerMinute: 100, dailyRequestBudget: 1 });
    const request = () =>
      new Request("https://ai.example.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${credential.virtualKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "default-chat", messages: [] }),
      });
    expect((await handler(request())).status).toBe(200);
    const blocked = await handler(request());
    expect(blocked.status).toBe(429);
    expect((await blocked.json() as { error: { code: string } }).error.code).toBe("daily_budget_exceeded");
    expect(upstreamCalls).toBe(1);
  });

  it("returns 503 for all application traffic while the kill switch is on", async () => {
    const store = new MemoryStore();
    const handler = createAiProxyHandler({
      store,
      environment: { ...environment, AI_DISABLE: "true" },
      fetch: async () => Response.json({ ok: true }),
    });
    const credential = await issueCredential(handler);
    const response = await handler(
      new Request("https://ai.example.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${credential.virtualKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "default-chat", messages: [] }),
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("ai_disabled");
  });

  it("stores a managed DeepSeek provider without returning its key and routes default-chat to it", async () => {
    const providers = new MemoryProviderStore();
    const store = new MemoryStore();
    let routedAuthorization = "";
    let routedModel = "";
    const handler = createAiProxyHandler({
      store,
      providers,
      environment,
      fetch: async (input, init) => {
        if (String(input).endsWith("/models")) return Response.json({ data: [] });
        routedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
        routedModel = String((JSON.parse(String(init?.body)) as { model: string }).model);
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      },
    });
    const create = await handler(new Request("https://ai.example.test/admin/v1/providers", {
      method: "POST",
      headers: { authorization: "Bearer control-token", "content-type": "application/json" },
      body: JSON.stringify({
        name: "DeepSeek",
        providerType: "deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "sk-deepseek-secret",
        defaultModel: "deepseek-v4-flash",
        models: ["deepseek-v4-flash", "deepseek-v4-pro"],
        enabled: true,
        isDefault: true,
      }),
    }));
    expect(create.status).toBe(201);
    expect(JSON.stringify(await create.json())).not.toContain("sk-deepseek-secret");

    const credential = await issueCredential(handler);
    const response = await handler(new Request("https://ai.example.test/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${credential.virtualKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "default-chat", messages: [{ role: "user", content: "hello" }] }),
    }));
    expect(response.status).toBe(200);
    expect(routedAuthorization).toBe("Bearer sk-deepseek-secret");
    expect(routedModel).toBe("deepseek-v4-flash");
  });
});
