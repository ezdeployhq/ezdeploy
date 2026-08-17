import { createHash } from "node:crypto";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Deployment, EZdeployManifest } from "@ezdeploy/contracts";
import { loadManifest, EZdeployError } from "@ezdeploy/contracts";
import type { DeployApplicationInput, DeployApplicationResult, DeploymentPlan } from "@ezdeploy/core";
import { c as createArchive } from "tar";
import { hash as blake3 } from "blake3-wasm";
import WebSocket from "ws";
import { ProcessCommandRunner } from "./command-runner.js";

interface CloudDeploymentBundle {
  version: 1;
  manifest: EZdeployManifest;
  assets: Array<{ path: string; hash: string; contentType: string; base64: string }>;
  workerScript?: string;
  routes?: string;
  headers?: string;
  redirects?: string;
  migrations: Array<{ name: string; sql: string }>;
}

export interface RemoteDeploymentServiceOptions {
  baseUrl: string;
  token?: string;
  tokenProvider?: () => Promise<string>;
  accessClientId?: string;
  accessClientSecret?: string;
  fetch?: typeof globalThis.fetch;
  maxArchiveBytes?: number;
  cloudBundle?: boolean;
  deploymentTimeoutMs?: number;
}

export type ConfirmableDeploymentPlan = DeploymentPlan & {
  planDigest: string;
  requiresConfirmation: boolean;
  risks?: string[];
  connectCodeExpiresAt?: string;
};

export class RemoteDeploymentService {
  private readonly fetcher: typeof globalThis.fetch;
  private tokenPromise?: Promise<string>;

  constructor(private readonly options: RemoteDeploymentServiceOptions) {
    if (!options.baseUrl || (!options.token && !options.tokenProvider)) {
      throw new EZdeployError(
        "PROVIDER_NOT_CONFIGURED",
        "ZAODEPLOY_CONTROL_PLANE_URL and ZAODEPLOY_CONTROL_PLANE_TOKEN are required",
      );
    }
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  inspect(projectDirectory: string): Promise<EZdeployManifest> {
    return loadManifest(projectDirectory);
  }

  async plan(projectDirectory: string): Promise<ConfirmableDeploymentPlan> {
    return this.request("/v1/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await this.inspect(projectDirectory)),
    });
  }

  async previewWithConnectCode(
    projectDirectory: string,
    connectCode: string,
  ): Promise<ConfirmableDeploymentPlan> {
    return this.unauthenticatedRequest("/v1/connect/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: connectCode,
        manifest: await this.inspect(projectDirectory),
      }),
    });
  }

  async deploy(
    input: DeployApplicationInput,
    confirmedPlanDigest?: string,
  ): Promise<DeployApplicationResult> {
    const manifest = await this.inspect(input.projectDirectory);
    if (manifest.spec.buildCommand) {
      const command = localBuildCommand(manifest.spec.buildCommand);
      await new ProcessCommandRunner().run(command.executable, command.args, {
        cwd: input.projectDirectory,
        inheritEnv: false,
        env: { PATH: process.env.PATH, CI: "true", NODE_ENV: "production", NO_COLOR: "1" },
      });
    }
    const useCloudBundle = this.options.cloudBundle ?? new URL(this.options.baseUrl).hostname.endsWith("workers.dev");
    const cloudPlan = useCloudBundle
      ? await this.request<ConfirmableDeploymentPlan>("/v1/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(manifest),
        })
      : undefined;
    if (
      useCloudBundle &&
      confirmedPlanDigest &&
      cloudPlan?.planDigest !== confirmedPlanDigest
    ) {
      throw new EZdeployError(
        "MANIFEST_INVALID",
        "The project changed after the user confirmed the deployment plan",
      );
    }
    const planDigest = confirmedPlanDigest ?? cloudPlan?.planDigest;
    const archive = useCloudBundle
      ? await this.cloudBundle(input.projectDirectory, manifest)
      : await this.archive(input.projectDirectory);
    const accepted = await this.request<DeployApplicationResult & { id?: string; status?: string }>(
      `/v1/deployments?environment=${encodeURIComponent(input.environment ?? "production")}`,
      {
      method: "POST",
      headers: {
        "content-type": useCloudBundle ? "application/vnd.zaodeploy.bundle+json" : "application/gzip",
        "x-zaodeploy-source-sha256": createHash("sha256").update(archive).digest("hex"),
        "x-zaodeploy-prebuilt": "true",
        ...(planDigest ? { "x-zaodeploy-plan-digest": planDigest } : {}),
      },
      body: Uint8Array.from(archive).buffer,
      },
    );
    if (accepted.status !== "queued" || !accepted.id) return accepted;
    const deadline = Date.now() + (this.options.deploymentTimeoutMs ?? 5 * 60_000);
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const current = await this.request<Record<string, unknown>>(
        `/v1/deployments/${encodeURIComponent(accepted.id)}`,
      );
      if (current.status === "ready") {
        return {
          deployment: {
            id: String(current.id),
            applicationId: String(current.application_id),
            environmentId: String(current.environment_id),
            sequence: Number(current.sequence),
            status: "ready",
            runtime: String(current.runtime) as Deployment["runtime"],
            sourceDirectory: String(current.artifact_key),
            manifestDigest: String(current.artifact_digest),
            providerDeploymentId: String(current.provider_deployment_id),
            url: String(current.url),
            errorCode: null,
            errorMessage: null,
            createdAt: String(current.created_at),
            updatedAt: String(current.updated_at),
          },
          plan: cloudPlan!,
        };
      }
      if (current.status === "failed") {
        throw new EZdeployError(
          "DEPLOY_FAILED",
          String(current.error_message ?? "Online deployment failed"),
          { deploymentId: accepted.id },
        );
      }
    }
    throw new EZdeployError("DEPLOY_FAILED", "Online deployment did not finish within 5 minutes", {
      deploymentId: accepted.id,
    });
  }

  private async cloudBundle(
    projectDirectory: string,
    manifest: EZdeployManifest,
  ): Promise<Buffer> {
    const outputDirectory = path.resolve(
      projectDirectory,
      manifest.spec.outputDirectory ?? (manifest.spec.runtime === "vite" ? "dist" : "."),
    );
    const projectRoot = path.resolve(projectDirectory);
    if (outputDirectory !== projectRoot && !outputDirectory.startsWith(`${projectRoot}${path.sep}`)) {
      throw new EZdeployError("MANIFEST_INVALID", "outputDirectory must stay inside the project");
    }
    const assets = await collectAssets(outputDirectory);
    const temporary = await mkdtemp(path.join(tmpdir(), "zaodeploy-bundle-"));
    try {
      let workerScript: string | undefined;
      let routes: string | undefined;
      if (await exists(path.join(projectDirectory, "functions"))) {
        const outfile = path.join(temporary, "worker.mjs");
        const routesPath = path.join(temporary, "routes.json");
        await new ProcessCommandRunner().run(
          "npx",
          ["--no-install", "wrangler", "pages", "functions", "build", "functions",
            "--outfile", outfile,
            "--project-directory", projectRoot,
            "--build-output-directory", outputDirectory,
            "--output-routes-path", routesPath,
            "--minify"],
          { cwd: projectDirectory, inheritEnv: false, env: { PATH: process.env.PATH, NO_COLOR: "1" } },
        );
        workerScript = await readFile(outfile, "utf8");
        if (await exists(routesPath)) routes = await readFile(routesPath, "utf8");
      }
      const migrationRequest = manifest.spec.resources.find((item) => item.kind === "database");
      const migrations = migrationRequest?.migrationsDirectory
        ? await collectMigrations(path.resolve(projectDirectory, migrationRequest.migrationsDirectory), projectRoot)
        : [];
      const bundle: CloudDeploymentBundle = {
        version: 1,
        manifest,
        assets,
        ...(workerScript ? { workerScript } : {}),
        ...(routes ? { routes } : {}),
        ...(await optionalText(outputDirectory, "_headers", "headers")),
        ...(await optionalText(outputDirectory, "_redirects", "redirects")),
        migrations,
      };
      const encoded = Buffer.from(JSON.stringify(bundle));
      const maximum = this.options.maxArchiveBytes ?? 25 * 1024 * 1024;
      if (encoded.byteLength > maximum) {
        throw new EZdeployError("MANIFEST_INVALID", "Deployment bundle exceeds 25 MiB");
      }
      return encoded;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  getDeployment(id: string): Promise<Deployment> {
    return this.request(`/v1/deployments/${encodeURIComponent(id)}`);
  }

  listApplications(): Promise<unknown> {
    return this.request("/v1/apps");
  }

  rollbackDeployment(id: string): Promise<unknown> {
    return this.request(`/v1/deployments/${encodeURIComponent(id)}/rollback`, { method: "POST" });
  }

  async getLogs(id: string): Promise<unknown> {
    const result = await this.request<{
      events?: unknown[];
      runtimeSession?: { id: string; url: string } | null;
    }>(`/v1/deployments/${encodeURIComponent(id)}/logs`);
    if (!result.runtimeSession) return result;
    const runtime: unknown[] = [];
    const { id: tailId, url } = result.runtimeSession;
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url, "trace-v1", {
          headers: { "User-Agent": "zaodeploy-agent-gateway" },
        });
        const timer = setTimeout(() => {
          socket.terminate();
          resolve();
        }, 4_000);
        socket.once("open", () => socket.send(JSON.stringify({ debug: false })));
        socket.on("message", (data) => {
          const text = data.toString();
          try { runtime.push(JSON.parse(text)); } catch { runtime.push({ message: text }); }
        });
        socket.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        socket.once("close", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } finally {
      await this.request(
        `/v1/deployments/${encodeURIComponent(id)}/logs?tailId=${encodeURIComponent(tailId)}`,
        { method: "DELETE" },
      ).catch(() => undefined);
    }
    return { events: result.events ?? [], runtime };
  }

  deleteDeployment(id: string, removeResources = false): Promise<unknown> {
    return this.request(
      `/v1/deployments/${encodeURIComponent(id)}?removeResources=${String(removeResources)}`,
      { method: "DELETE" },
    );
  }

  private async archive(projectDirectory: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = createArchive(
      {
        cwd: projectDirectory,
        gzip: true,
        portable: true,
        filter: (entryPath) => !this.excluded(entryPath),
      },
      ["."],
    );
    let size = 0;
    const maximum = this.options.maxArchiveBytes ?? 25 * 1024 * 1024;
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > maximum) {
        stream.destroy();
        throw new EZdeployError("MANIFEST_INVALID", "Project archive exceeds 25 MiB");
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  private excluded(entryPath: string): boolean {
    const normalized = entryPath.replace(/^\.\//, "");
    const segments = normalized.split("/");
    if (segments.some((segment) => ["node_modules", ".git", ".zaodeploy"].includes(segment))) {
      return true;
    }
    const name = segments.at(-1) ?? "";
    return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
  }

  private async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    this.tokenPromise ??= this.options.token
      ? Promise.resolve(this.options.token)
      : this.options.tokenProvider!();
    const token = await this.tokenPromise;
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${pathname}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(this.options.accessClientId
          ? { "CF-Access-Client-Id": this.options.accessClientId }
          : {}),
        ...(this.options.accessClientSecret
          ? { "CF-Access-Client-Secret": this.options.accessClientSecret }
          : {}),
        ...init.headers,
      },
    });
    const body = await response.json() as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
      result?: T;
    } | T;
    if (!response.ok) {
      const error = (body as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      }).error;
      throw new EZdeployError(
        (error?.code as "DEPLOY_FAILED") ?? "DEPLOY_FAILED",
        error?.message ?? `Control plane returned HTTP ${response.status}`,
        error?.details,
      );
    }
    return body as T;
  }

  private async unauthenticatedRequest<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, "")}${pathname}`, init);
    const body = await response.json() as {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    } | T;
    if (!response.ok) {
      const error = (body as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      }).error;
      throw new EZdeployError(
        (error?.code as "DEPLOY_FAILED") ?? "DEPLOY_FAILED",
        error?.message ?? `Agent API returned HTTP ${response.status}`,
        error?.details,
      );
    }
    return body as T;
  }
}

async function exists(filename: string): Promise<boolean> {
  try { await access(filename); return true; } catch { return false; }
}

async function collectAssets(directory: string): Promise<CloudDeploymentBundle["assets"]> {
  const result: CloudDeploymentBundle["assets"] = [];
  async function visit(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new EZdeployError("MANIFEST_INVALID", "Build output may not contain links");
      if (entry.isDirectory()) { await visit(absolute); continue; }
      if (!entry.isFile() || ["_headers", "_redirects", "_routes.json", "_worker.js"].includes(entry.name)) continue;
      const content = await readFile(absolute);
      const relative = path.relative(directory, absolute).split(path.sep).join("/");
      const extension = path.extname(relative).slice(1);
      const base64 = content.toString("base64");
      result.push({
        path: `/${relative}`,
        hash: Buffer.from(blake3(`${base64}${extension}`)).toString("hex").slice(0, 32),
        contentType: contentType(relative),
        base64,
      });
    }
  }
  await visit(directory);
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function collectMigrations(directory: string, root: string): Promise<Array<{ name: string; sql: string }>> {
  if (directory !== root && !directory.startsWith(`${root}${path.sep}`)) {
    throw new EZdeployError("MANIFEST_INVALID", "migrationsDirectory must stay inside the project");
  }
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .sort((left, right) => left.name.localeCompare(right.name));
  return Promise.all(entries.map(async (entry) => ({ name: entry.name, sql: await readFile(path.join(directory, entry.name), "utf8") })));
}

async function optionalText(directory: string, filename: string, key: "headers" | "redirects") {
  const target = path.join(directory, filename);
  return await exists(target) ? { [key]: await readFile(target, "utf8") } : {};
}

function contentType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".woff": "font/woff", ".woff2": "font/woff2",
  } as Record<string, string>)[extension] ?? "application/octet-stream";
}

function localBuildCommand(command: string): { executable: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  const signature = parts.join(" ");
  if (!/^(npm run [a-zA-Z0-9:_-]+|pnpm(?: run)? [a-zA-Z0-9:_-]+|yarn [a-zA-Z0-9:_-]+|bun run [a-zA-Z0-9:_-]+)$/.test(signature)) {
    throw new EZdeployError("MANIFEST_INVALID", `Unsupported buildCommand '${command}'`);
  }
  return { executable: parts[0], args: parts.slice(1) };
}
