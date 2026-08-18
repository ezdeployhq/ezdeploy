import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { bundleFromStaticZip, contentTypeFor, normalizeAppName } from "./upload.js";

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) entries[path] = strToU8(content);
  return zipSync(entries);
}

async function planDigestOf(manifest: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(manifest)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("static ZIP upload bundling", () => {
  it("builds a contract-valid static bundle with deterministic hashes", async () => {
    const zip = makeZip({ "index.html": "<h1>hi</h1>", "assets/app.css": "body{}", "logo.svg": "<svg/>" });
    const { bundle, fileCount, totalBytes } = await bundleFromStaticZip("My Site!", zip);
    expect(fileCount).toBe(3);
    expect(totalBytes).toBeGreaterThan(0);
    expect(bundle.version).toBe(1);
    expect(bundle.manifest.apiVersion).toBe("ezdeploy.io/v1alpha1");
    expect(bundle.manifest.kind).toBe("Application");
    expect(bundle.manifest.metadata.name).toBe("my-site");
    expect(bundle.manifest.spec.runtime).toBe("static");
    expect(bundle.manifest.spec.resources).toEqual([]);
    expect(bundle.manifest.spec.access.mode).toBe("public");
    const paths = bundle.assets.map((asset) => asset.path);
    expect(paths).toContain("index.html");
    for (const asset of bundle.assets) {
      expect(asset.hash).toMatch(/^[a-f0-9]{32}$/);
      expect(asset.base64.length).toBeGreaterThan(0);
    }
    expect(bundle.assets.find((asset) => asset.path === "assets/app.css")?.contentType).toBe("text/css");
    // The control plane binds deployment to sha256(JSON.stringify(bundle.manifest));
    // recomputing from a JSON round trip must yield the same digest.
    const reparsed = JSON.parse(JSON.stringify(bundle.manifest));
    expect(await planDigestOf(reparsed)).toBe(await planDigestOf(bundle.manifest));
  });

  it("strips a single top-level export folder and skips junk entries", async () => {
    const zip = makeZip({
      "my-export/index.html": "<h1>hi</h1>",
      "my-export/style.css": "body{}",
      "__MACOSX/my-export/._index.html": "junk",
      "my-export/.DS_Store": "junk",
    });
    const { bundle } = await bundleFromStaticZip("site", zip);
    expect(bundle.assets.map((asset) => asset.path).sort()).toEqual(["index.html", "style.css"]);
  });

  it("rejects archives without a root index.html", async () => {
    await expect(bundleFromStaticZip("site", makeZip({ "docs/readme.md": "x" })))
      .rejects.toThrow("NO_INDEX_HTML");
  });

  it("rejects invalid zips and unsafe names", async () => {
    await expect(bundleFromStaticZip("site", strToU8("not a zip"))).rejects.toThrow("INVALID_ZIP");
    await expect(bundleFromStaticZip("!!!", makeZip({ "index.html": "x" }))).rejects.toThrow("INVALID_NAME");
  });

  it("normalizes app names into DNS-safe slugs", () => {
    expect(normalizeAppName("  My_Expense App v2 ")).toBe("my-expense-app-v2");
    expect(normalizeAppName("--weird--name--")).toBe("weird-name");
    expect(normalizeAppName("a".repeat(80))).toHaveLength(50);
  });

  it("maps content types with an octet-stream fallback", () => {
    expect(contentTypeFor("a/b/index.html")).toContain("text/html");
    expect(contentTypeFor("app.wasm")).toBe("application/octet-stream");
  });
});
