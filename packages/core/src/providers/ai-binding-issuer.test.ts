import { describe, expect, it } from "vitest";
import type { SecretStore } from "../secrets.js";
import { HttpAiBindingIssuer } from "./ai-binding-issuer.js";

class MemorySecretStore implements SecretStore {
  values = new Map<string, string>();
  async put(value: string) { this.values.set("secret://local/test", value); return "secret://local/test"; }
  async get(reference: string) { return this.values.get(reference) ?? ""; }
  async delete(reference: string) { this.values.delete(reference); }
}

describe("HttpAiBindingIssuer", () => {
  it("stores only the issued virtual key and revokes both remote and local credentials", async () => {
    const store = new MemorySecretStore();
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const issuer = new HttpAiBindingIssuer({
      baseUrl: "https://ai.internal.example",
      controlPlaneToken: "control-secret",
      secretStore: store,
      fetch: async (input, init) => {
        const request = new Request(input, init);
        calls.push({ url: request.url, authorization: request.headers.get("authorization") });
        if (request.method === "POST") {
          return Response.json(
            { credentialId: "credential-1", virtualKey: "zai_scoped-app-key" },
            { status: 201 },
          );
        }
        return Response.json({ revoked: true });
      },
    });
    const issued = await issuer.issue({
      applicationId: "app-1",
      environmentId: "env-1",
      applicationSlug: "example",
      environmentName: "production",
    });

    expect(issued).toEqual({
      externalId: "credential-1",
      secretReference: "secret://local/test",
      baseUrl: "https://ai.internal.example/v1",
    });
    expect(store.values.get(issued.secretReference)).toBe("zai_scoped-app-key");
    await issuer.revoke({
      id: "binding-1",
      applicationId: "app-1",
      environmentId: "env-1",
      kind: "ai",
      provider: "zaodeploy-ai",
      externalId: issued.externalId,
      secretReference: issued.secretReference,
      configuration: {},
      createdAt: new Date().toISOString(),
    });
    expect(store.values.size).toBe(0);
    expect(calls).toEqual([
      { url: "https://ai.internal.example/admin/v1/credentials", authorization: "Bearer control-secret" },
      { url: "https://ai.internal.example/admin/v1/credentials/credential-1", authorization: "Bearer control-secret" },
    ]);
  });
});
