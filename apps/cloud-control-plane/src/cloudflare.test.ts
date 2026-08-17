import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAccess, pagesCustomDomainStatus, pagesDeploymentForm, pagesProjectHostname, preparePagesCustomDomain } from "./cloudflare.js";
import type { DeploymentBundle } from "./types.js";

const envelope = (result: unknown) => Response.json({ success: true, result });

describe("Cloudflare custom domains", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("associates the Pages domain before creating an exact DNS-only CNAME", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("/dns_records?name=")) return envelope([]);
      if (url.endsWith("/dns_records") && method === "POST") return envelope({ id: "dns-id" });
      if (url.endsWith("/domains") && method === "GET") return envelope([]);
      if (url.endsWith("/domains") && method === "POST") return envelope({ id: "domain-id" });
      if (url.endsWith("/domains/example.apps.example.com") && method === "PATCH") return envelope({ id: "domain-id" });
      throw new Error(`Unexpected request ${method} ${url}`);
    }));

    const url = await preparePagesCustomDomain({
      CLOUDFLARE_API_TOKEN: "secret",
      CLOUDFLARE_ZONE_ID: "zone-id",
    } as never, "/accounts/account/pages/projects/zao-example-production",
    "example.apps.example.com", "zao-example-production-bps.pages.dev");

    expect(url).toBe("https://example.apps.example.com");
    const dnsCreate = calls.find((call) => call.url.endsWith("/dns_records") && call.method === "POST");
    expect(JSON.parse(dnsCreate?.body ?? "{}")).toMatchObject({
      type: "CNAME",
      name: "example.apps.example.com",
      content: "zao-example-production-bps.pages.dev",
      proxied: false,
    });
    expect(calls.findIndex((call) => call.url.endsWith("/domains") && call.method === "POST"))
      .toBeLessThan(calls.findIndex((call) => call.url.endsWith("/dns_records") && call.method === "POST"));
    expect(calls.findIndex((call) => call.url.endsWith("/dns_records") && call.method === "POST"))
      .toBeLessThan(calls.findIndex((call) => call.url.endsWith("/domains/example.apps.example.com") && call.method === "PATCH"));
  });

  it("refuses to silently fall back when the zone is not configured", async () => {
    await expect(preparePagesCustomDomain({
      CLOUDFLARE_API_TOKEN: "secret",
    } as never, "/project", "example.apps.example.com", "zao-example-production.pages.dev"))
      .rejects.toThrow(/CLOUDFLARE_ZONE_ID/);
  });

  it("re-registers a domain left pending by an earlier failed activation", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.endsWith("/domains") && method === "GET") {
        return envelope([{ name: "example.apps.example.com", status: "pending" }]);
      }
      if (url.includes("/domains/example.apps.example.com") && method === "DELETE") return envelope(null);
      if (url.endsWith("/domains") && method === "POST") return envelope({ id: "domain-id" });
      if (url.endsWith("/domains/example.apps.example.com") && method === "PATCH") return envelope({ id: "domain-id" });
      if (url.includes("/dns_records?name=")) {
        return envelope([{ id: "dns-id", type: "CNAME", name: "example.apps.example.com", content: "zao-example-production.pages.dev", proxied: true }]);
      }
      if (url.endsWith("/dns_records/dns-id") && method === "PUT") return envelope({ id: "dns-id" });
      throw new Error(`Unexpected request ${method} ${url}`);
    }));

    await preparePagesCustomDomain({
      CLOUDFLARE_API_TOKEN: "secret",
      CLOUDFLARE_ZONE_ID: "zone-id",
    } as never, "/accounts/account/pages/projects/zao-example-production",
    "example.apps.example.com", "zao-example-production.pages.dev");

    expect(calls.some((call) => call.url.endsWith("/domains/example.apps.example.com") && call.method === "DELETE")).toBe(true);
    expect(calls.findIndex((call) => call.url.endsWith("/domains/example.apps.example.com") && call.method === "DELETE"))
      .toBeLessThan(calls.findIndex((call) => call.url.endsWith("/domains") && call.method === "POST"));
    const dnsUpdate = calls.find((call) => call.url.endsWith("/dns_records/dns-id") && call.method === "PUT");
    expect(JSON.parse(dnsUpdate?.body ?? "{}")).toMatchObject({ proxied: false });
  });

  it("reports pending activation for a durable workflow wait", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => envelope({
      status: "pending",
      verification_data: { status: "active" },
    })));
    await expect(pagesCustomDomainStatus({
      CLOUDFLARE_API_TOKEN: "secret",
    } as never, "/project", "example.apps.example.com")).resolves.toBe("pending");
  });

  it("uses the Pages API canonical subdomain when Cloudflare adds a uniqueness suffix", () => {
    expect(pagesProjectHostname({ subdomain: "https://zao-example-production-bps.pages.dev/" }, "zao-example-production"))
      .toBe("zao-example-production-bps.pages.dev");
    expect(pagesProjectHostname({}, "zao-example-production"))
      .toBe("zao-example-production.pages.dev");
  });
});

describe("Cloudflare Access opt-in", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const manifest = (mode: "public" | "organization") => ({
    metadata: { name: "example-app" },
    spec: { access: { mode, allowedGroups: [] } },
  });

  it("does not require the Access API for a public-only installation", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(applyAccess(
      { ACCESS_ENABLED: "false" } as never,
      manifest("public") as never,
      "production",
      "https://example.pages.dev",
    )).resolves.toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails clearly when organization access was not configured", async () => {
    await expect(applyAccess(
      { ACCESS_ENABLED: "false" } as never,
      manifest("organization") as never,
      "production",
      "https://example.pages.dev",
    )).rejects.toThrow(/ACCESS_ENABLED=true/);
  });
});

describe("Cloudflare Pages direct upload", () => {
  const bundle = (workerScript: string): DeploymentBundle => ({
    version: 1,
    manifest: {
      apiVersion: "ezdeploy.io/v1alpha1",
      kind: "Application",
      metadata: { name: "example" },
      spec: {
        runtime: "vite",
        resources: [],
        access: { mode: "public", allowedGroups: [] },
        healthCheck: { path: "/", timeoutSeconds: 10 },
      },
    },
    assets: [],
    migrations: [],
    workerScript,
    routes: '{"version":1,"include":["/api/*"],"exclude":[]}',
  });

  it("uploads a plain advanced-mode Worker as _worker.js", () => {
    const form = pagesDeploymentForm("production", bundle(
      "export default { fetch() { return new Response('ok') } }",
    ));

    expect(form.get("_worker.js")).toBeInstanceOf(File);
    expect(form.has("_worker.bundle")).toBe(false);
    expect(form.get("_routes.json")).toBeInstanceOf(File);
  });

  it("preserves the boundary of a Wrangler multipart Functions bundle", () => {
    const boundary = "----formdata-undici-test-boundary";
    const form = pagesDeploymentForm("production", bundle(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{}`,
    ));
    const file = form.get("_worker.bundle");

    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe(`multipart/form-data; boundary=${boundary}`);
    expect(form.has("_worker.js")).toBe(false);
  });
});
