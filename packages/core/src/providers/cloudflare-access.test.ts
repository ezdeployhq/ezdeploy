import { describe, expect, it } from "vitest";
import { CloudflareAccessController } from "./cloudflare-access.js";

describe("CloudflareAccessController", () => {
  it("creates a deny-by-default self-hosted application with an organization allow policy", async () => {
    const requests: Request[] = [];
    const controller = new CloudflareAccessController({
      accountId: "account-id",
      apiToken: "access-token",
      organizationEmailDomain: "example.com",
      serviceTokenIds: ["service-token-id"],
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return request.method === "GET"
          ? Response.json({ success: true, result: [] })
          : Response.json({ success: true, result: { id: "access-app" } });
      },
    });
    await controller.apply({
      applicationSlug: "expenses",
      environmentName: "production",
      url: "https://expenses.pages.dev",
      mode: "organization",
      allowedGroups: [],
    });

    expect(requests).toHaveLength(2);
    const body = await requests[1].json() as Record<string, unknown>;
    expect(body).toMatchObject({
      name: "zaodeploy-expenses-production",
      type: "self_hosted",
      domain: "expenses.pages.dev",
    });
    expect(body.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: "allow",
        include: [{ email_domain: { domain: "example.com" } }],
      }),
    ]));
    expect(body).toMatchObject({
      destinations: [
        { type: "public", uri: "expenses.pages.dev" },
        { type: "public", uri: "*.expenses.pages.dev" },
      ],
    });
    expect(body.policies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        decision: "non_identity",
        include: [{ service_token: { token_id: "service-token-id" } }],
      }),
    ]));
    expect(JSON.stringify(body)).not.toContain("access-token");
  });

  it("removes an existing Access application when access becomes public", async () => {
    const methods: string[] = [];
    const controller = new CloudflareAccessController({
      accountId: "account-id",
      apiToken: "token",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        methods.push(request.method);
        return Response.json({
          success: true,
          result: request.method === "GET"
            ? [{ id: "app-id", name: "zaodeploy-expenses-production" }]
            : {},
        });
      },
    });
    await controller.apply({
      applicationSlug: "expenses",
      environmentName: "production",
      url: "https://expenses.pages.dev",
      mode: "public",
      allowedGroups: [],
    });
    expect(methods).toEqual(["GET", "DELETE"]);
  });
});
