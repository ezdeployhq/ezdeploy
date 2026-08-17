import { describe, expect, it, vi } from "vitest";
import handler from "./index.js";

describe("zero-install agent ingress", () => {
  it("publishes agent-readable Markdown and capability discovery", async () => {
    const environment = {
      APP_CENTER_URL: "https://apps.example.com",
      CONTROL_PLANE: { fetch: vi.fn() },
      ASSETS: { fetch: vi.fn(async (request: Request) => new Response(new URL(request.url).pathname)) },
    };
    const guide = await handler.fetch(
      new Request("https://agent.apps.example.com/agent.md"),
      environment as never,
    );
    expect(guide.headers.get("content-type")).toContain("text/markdown");
    const markdown = await guide.text();
    expect(markdown).toContain("/skill/ezdeploy-deploy/SKILL.md");
    expect(markdown).toContain("部署到应用中心");
    expect(markdown).toContain("--connection-key");
    expect(markdown).toContain("--plan-digest");
    expect(markdown).toContain("/client/ezdeploy-agent.cjs");
    expect(markdown).toContain("/client/blake3_js_bg.wasm");
    expect(markdown).toContain("/client/manifest.json");
    expect(markdown).toContain("integrity check failed");
    expect(markdown).toContain("https://apps.example.com");

    const discovery = await handler.fetch(
      new Request("https://agent.apps.example.com/.well-known/ezdeploy.json"),
      environment as never,
    );
    expect(await discovery.json()).toMatchObject({
      schemaVersion: "1.2",
      documentation: "https://agent.apps.example.com/agent.md",
      skill: "https://agent.apps.example.com/skill/ezdeploy-deploy/SKILL.md",
      authentication: {
        persistent: true,
        revocable: true,
      },
      legacyConnect: {
        planEndpoint: "https://agent.apps.example.com/v1/connect/plan",
        singleUse: true,
        expiresInSeconds: 600,
      },
      deployment: {
        successState: "ready",
        requiresPlanConfirmation: true,
        planDigestHeader: "x-zaodeploy-plan-digest",
      },
    });
    const legacyDiscovery = await handler.fetch(
      new Request("https://agent.apps.example.com/.well-known/zaodeploy.json"),
      environment as never,
    );
    expect(legacyDiscovery.status).toBe(200);

    const aliases = await Promise.all(["/agents.md", "/auth.md"].map((pathname) =>
      handler.fetch(new Request(`https://agent.apps.example.com${pathname}`), environment as never)
    ));
    expect(aliases.every((response) => response.status === 200)).toBe(true);
    const skill = await handler.fetch(
      new Request("https://agent.apps.example.com/skill.md"),
      environment as never,
    );
    expect(await skill.text()).toBe("/skill/ezdeploy-deploy/SKILL.md");

    const openapi = await handler.fetch(
      new Request("https://agent.apps.example.com/openapi.json"),
      environment as never,
    );
    expect(await openapi.json()).toMatchObject({
      openapi: "3.1.0",
      info: { version: "1.2.0" },
      paths: { "/v1/connect/plan": {}, "/v1/deployments": {} },
    });
  });

  it("forwards a connection exchange without accepting caller authorization", async () => {
    const forwarded = vi.fn(async (request: Request) => Response.json({
      authorization: request.headers.get("authorization"),
      ingress: request.headers.get("x-zaodeploy-agent-ingress"),
    }));
    const response = await handler.fetch(
      new Request("https://agent.apps.example.com/v1/connect/exchange", {
        method: "POST",
        headers: {
          authorization: "Bearer attacker-controlled",
          "content-type": "application/json",
        },
        body: JSON.stringify({ code: "ZAO-ABCD-2345" }),
      }),
      { CONTROL_PLANE: { fetch: forwarded }, ASSETS: { fetch: vi.fn() } } as never,
    );
    expect(forwarded).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ authorization: null, ingress: "1" });
  });

  it("keeps the legacy standalone-client URL as an alias", async () => {
    const assets = { fetch: vi.fn(async (request: Request) => new Response(new URL(request.url).pathname)) };
    const response = await handler.fetch(
      new Request("https://agent.apps.example.com/client/zaodeploy-agent.cjs"),
      { CONTROL_PLANE: { fetch: vi.fn() }, ASSETS: assets } as never,
    );

    expect(await response.text()).toBe("/client/ezdeploy-agent.cjs");
  });

  it("forwards an unredeemed plan preview without accepting caller authorization", async () => {
    const forwarded = vi.fn(async (request: Request) => Response.json({
      pathname: new URL(request.url).pathname,
      authorization: request.headers.get("authorization"),
      ingress: request.headers.get("x-zaodeploy-agent-ingress"),
    }));
    const response = await handler.fetch(
      new Request("https://agent.apps.example.com/v1/connect/plan", {
        method: "POST",
        headers: { authorization: "Bearer attacker-controlled" },
        body: "{}",
      }),
      { CONTROL_PLANE: { fetch: forwarded }, ASSETS: { fetch: vi.fn() } } as never,
    );
    expect(await response.json()).toEqual({
      pathname: "/v1/connect/plan",
      authorization: null,
      ingress: "1",
    });
  });
});
