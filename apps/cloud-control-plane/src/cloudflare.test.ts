import { afterEach, describe, expect, it, vi } from "vitest";
import { pagesCustomDomainStatus, preparePagesCustomDomain } from "./cloudflare.js";

const envelope = (result: unknown) => Response.json({ success: true, result });

describe("Cloudflare custom domains", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates the exact proxied CNAME before activating the Pages domain", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (url.includes("/dns_records?name=")) return envelope([]);
      if (url.endsWith("/dns_records") && method === "POST") return envelope({ id: "dns-id" });
      if (url.endsWith("/domains") && method === "GET") return envelope([]);
      if (url.endsWith("/domains") && method === "POST") return envelope({ id: "domain-id" });
      throw new Error(`Unexpected request ${method} ${url}`);
    }));

    const url = await preparePagesCustomDomain({
      CLOUDFLARE_API_TOKEN: "secret",
      CLOUDFLARE_ZONE_ID: "zone-id",
    } as never, "/accounts/account/pages/projects/zao-example-production",
    "example.apps.example.com", "zao-example-production");

    expect(url).toBe("https://example.apps.example.com");
    const dnsCreate = calls.find((call) => call.url.endsWith("/dns_records") && call.method === "POST");
    expect(JSON.parse(dnsCreate?.body ?? "{}")).toMatchObject({
      type: "CNAME",
      name: "example.apps.example.com",
      content: "zao-example-production.pages.dev",
      proxied: true,
    });
    expect(calls.findIndex((call) => call.url.endsWith("/dns_records") && call.method === "POST"))
      .toBeLessThan(calls.findIndex((call) => call.url.endsWith("/domains") && call.method === "POST"));
  });

  it("refuses to silently fall back when the zone is not configured", async () => {
    await expect(preparePagesCustomDomain({
      CLOUDFLARE_API_TOKEN: "secret",
    } as never, "/project", "example.apps.example.com", "zao-example-production"))
      .rejects.toThrow(/CLOUDFLARE_ZONE_ID/);
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
});
