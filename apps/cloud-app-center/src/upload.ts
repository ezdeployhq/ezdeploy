import { unzipSync } from "fflate";

export const MAX_ZIP_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_BYTES = 24 * 1024 * 1024;
export const MAX_FILES = 500;

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  map: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  avif: "image/avif",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  xml: "application/xml",
  pdf: "application/pdf",
  webmanifest: "application/manifest+json",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  csv: "text/csv; charset=utf-8",
};

export function contentTypeFor(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

export function normalizeAppName(raw: string): string {
  const name = raw.trim().toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  if (!name) throw new Error("INVALID_NAME");
  return name;
}

async function hashAsset(base64: string, extension: string): Promise<string> {
  // 32 lowercase hex characters are what the Pages upload flow needs as a
  // deterministic content key; a truncated SHA-256 is sufficient.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${base64}${extension}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function toBase64(content: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let offset = 0; offset < content.length; offset += chunk) {
    binary += String.fromCharCode(...content.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export interface StaticBundle {
  bundle: {
    version: 1;
    manifest: {
      apiVersion: "ezdeploy.io/v1alpha1";
      kind: "Application";
      metadata: { name: string; displayName: string };
      spec: {
        runtime: "static";
        resources: [];
        access: { mode: "public"; allowedGroups: [] };
        healthCheck: { path: string; timeoutSeconds: number };
      };
    };
    assets: Array<{ path: string; hash: string; contentType: string; base64: string }>;
    migrations: [];
  };
  fileCount: number;
  totalBytes: number;
}

export async function bundleFromStaticZip(rawName: string, zip: Uint8Array): Promise<StaticBundle> {
  const name = normalizeAppName(rawName);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zip);
  } catch {
    throw new Error("INVALID_ZIP");
  }
  let paths = Object.keys(entries).filter(
    (path) => !path.endsWith("/") && !path.startsWith("__MACOSX") && !path.split("/").pop()!.startsWith("."),
  );
  // Exported archives often nest everything under a single top-level folder.
  const roots = new Set(paths.map((path) => path.split("/")[0]));
  if (roots.size === 1 && paths.every((path) => path.includes("/"))) {
    const prefix = `${[...roots][0]}/`;
    paths = paths.map((path) => path.slice(prefix.length));
    entries = Object.fromEntries(
      Object.entries(entries)
        .filter(([path]) => path.startsWith(prefix) && !path.endsWith("/"))
        .map(([path, content]) => [path.slice(prefix.length), content]),
    );
  }
  for (const path of paths) {
    if (path.includes("..") || path.startsWith("/") || path.length > 512) throw new Error("INVALID_PATH");
  }
  if (paths.length === 0) throw new Error("EMPTY_ZIP");
  if (paths.length > MAX_FILES) throw new Error("TOO_MANY_FILES");
  if (!paths.includes("index.html")) throw new Error("NO_INDEX_HTML");
  const totalBytes = paths.reduce((sum, path) => sum + entries[path].length, 0);
  if (totalBytes > MAX_EXTRACTED_BYTES) throw new Error("EXTRACTED_TOO_LARGE");

  const assets = [];
  for (const path of paths.sort()) {
    const content = entries[path];
    const base64 = toBase64(content);
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    assets.push({ path, hash: await hashAsset(base64, extension), contentType: contentTypeFor(path), base64 });
  }
  return {
    bundle: {
      version: 1,
      manifest: {
        apiVersion: "ezdeploy.io/v1alpha1",
        kind: "Application",
        metadata: { name, displayName: rawName.trim().slice(0, 80) || name },
        spec: {
          runtime: "static",
          resources: [],
          access: { mode: "public", allowedGroups: [] },
          healthCheck: { path: "/", timeoutSeconds: 10 },
        },
      },
      assets,
      migrations: [],
    },
    fileCount: assets.length,
    totalBytes,
  };
}
