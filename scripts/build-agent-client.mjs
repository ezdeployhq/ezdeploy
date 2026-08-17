import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "apps/agent-ingress/public/client");
await mkdir(output, { recursive: true });

const script = path.join(output, "ezdeploy-agent.cjs");
const wasm = path.join(output, "blake3_js_bg.wasm");
execFileSync(path.join(root, "node_modules/.bin/esbuild"), [
  path.join(root, "apps/mcp-server/src/cli.ts"),
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--target=node22",
  `--outfile=${script}`,
], { stdio: "inherit" });
await copyFile(
  path.join(root, "node_modules/blake3-wasm/dist/wasm/nodejs/blake3_js_bg.wasm"),
  wasm,
);

const files = {};
for (const filename of ["ezdeploy-agent.cjs", "blake3_js_bg.wasm"]) {
  const content = await readFile(path.join(output, filename));
  files[filename] = {
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: content.byteLength,
  };
}
await writeFile(
  path.join(output, "manifest.json"),
  `${JSON.stringify({
    version: "0.1.0",
    protocolVersion: "1.1",
    runtime: "node>=22",
    files,
  }, null, 2)}\n`,
);
