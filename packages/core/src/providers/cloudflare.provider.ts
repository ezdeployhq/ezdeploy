import { access, cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import type { ResourceBinding, EZdeployManifest } from "@ezdeploy/contracts";
import { EZdeployError } from "@ezdeploy/contracts";
import type {
  DeployContext,
  DeployProvider,
  DeploymentPlan,
  ProviderDeployment,
  ProvisionContext,
  VerificationResult,
} from "../provider.js";
import type { CommandResult, CommandRunner } from "./command-runner.js";
import { ProcessCommandRunner } from "./command-runner.js";
import type { SecretStore } from "../secrets.js";

export interface AiBindingIssuer {
  issue(context: ProvisionContext): Promise<{
    externalId: string;
    secretReference: string;
    baseUrl: string;
  }>;
  revoke(binding: ResourceBinding): Promise<void>;
}

export interface AccessPolicyController {
  apply(input: {
    applicationSlug: string;
    environmentName: string;
    url: string;
    mode: "public" | "organization";
    allowedGroups: string[];
  }): Promise<void>;
  remove(input: { applicationSlug: string; environmentName: string }): Promise<void>;
}

export interface CloudflareProviderOptions {
  accountId: string;
  apiToken: string;
  runner?: CommandRunner;
  aiIssuer?: AiBindingIssuer;
  secretStore?: SecretStore;
  accessController?: AccessPolicyController;
  fetch?: typeof globalThis.fetch;
  apiFetch?: typeof globalThis.fetch;
  runtimeLogWindowMs?: number;
  accessServiceToken?: { clientId: string; clientSecret: string };
}

function applicationResourceName(context: ProvisionContext, suffix?: string): string {
  const base = `${context.applicationSlug}-${context.environmentName}`.toLowerCase();
  return suffix ? `${base}-${suffix}`.slice(0, 63).replace(/-+$/, "") : base.slice(0, 63);
}

function output(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function extractDeploymentUrl(source: string): string | null {
  return source.match(/https:\/\/[a-z0-9.-]+\.(?:pages\.dev|workers\.dev)/i)?.[0] ?? null;
}

function extractVersionId(source: string): string | null {
  return source.match(/Version ID:\s*([0-9a-f-]{36})/i)?.[1] ?? null;
}

function buildCommand(command: string): { executable: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  const signature = parts.join(" ");
  const allowed =
    /^(npm run [a-zA-Z0-9:_-]+|pnpm(?: run)? [a-zA-Z0-9:_-]+|yarn [a-zA-Z0-9:_-]+|bun run [a-zA-Z0-9:_-]+)$/;
  if (!allowed.test(signature)) {
    throw new EZdeployError(
      "MANIFEST_INVALID",
      `Unsupported buildCommand '${command}'. Use an npm, pnpm, yarn, or bun script.`,
    );
  }
  return { executable: parts[0], args: parts.slice(1) };
}

function applicationBuildEnvironment(nodeEnvironment = "production"): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    CI: "true",
    NODE_ENV: nodeEnvironment,
    NO_COLOR: "1",
  };
}

async function resolveInsideProject(projectDirectory: string, candidate: string): Promise<string> {
  const project = await realpath(projectDirectory);
  const resolved = await realpath(path.resolve(project, candidate));
  const relative = path.relative(project, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new EZdeployError(
      "MANIFEST_INVALID",
      `Path '${candidate}' must stay inside the project directory`,
    );
  }
  return resolved;
}

export class CloudflareDeployProvider implements DeployProvider {
  readonly name = "cloudflare";
  private readonly runner: CommandRunner;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly apiFetcher: typeof globalThis.fetch;
  private readonly logsByDeployment = new Map<string, string[]>();
  private readonly preparationLogs = new Map<string, string[]>();

  constructor(private readonly options: CloudflareProviderOptions) {
    if (!options.accountId || !options.apiToken) {
      throw new EZdeployError(
        "PROVIDER_NOT_CONFIGURED",
        "Cloudflare account ID and API token are required by the control plane",
      );
    }
    this.runner = options.runner ?? new ProcessCommandRunner();
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.apiFetcher = options.apiFetch ?? globalThis.fetch;
  }

  supports(manifest: EZdeployManifest): boolean {
    return ["static", "vite", "cloudflare-workers"].includes(manifest.spec.runtime);
  }

  plan(manifest: EZdeployManifest): DeploymentPlan {
    if (!this.supports(manifest)) {
      throw new EZdeployError(
        "RUNTIME_UNSUPPORTED",
        `Cloudflare does not support runtime ${manifest.spec.runtime}`,
      );
    }
    return {
      provider: this.name,
      runtime: manifest.spec.runtime,
      buildCommand: manifest.spec.buildCommand,
      outputDirectory: manifest.spec.outputDirectory,
      resources: manifest.spec.resources.map((request) => ({
        kind: request.kind,
        provider:
          request.provider ??
          (request.kind === "database"
            ? "cloudflare-d1"
            : request.kind === "storage"
              ? "cloudflare-r2"
              : "zaodeploy-ai"),
        plan: request.plan,
      })),
      accessMode: manifest.spec.access.mode,
    };
  }

  async provision(
    context: ProvisionContext,
    request: EZdeployManifest["spec"]["resources"][number],
  ): Promise<Omit<ResourceBinding, "id" | "createdAt">> {
    try {
      if (request.kind === "database") return await this.createD1(context);
      if (request.kind === "storage") return await this.createR2(context);
      if (!this.options.aiIssuer) {
        throw new EZdeployError(
          "PROVIDER_NOT_CONFIGURED",
          "EZdeploy AI Proxy issuer is not configured",
        );
      }
      const issued = await this.options.aiIssuer.issue(context);
      return {
        applicationId: context.applicationId,
        environmentId: context.environmentId,
        kind: "ai",
        provider: "zaodeploy-ai",
        externalId: issued.externalId,
        secretReference: issued.secretReference,
        configuration: { baseUrl: issued.baseUrl, binding: "ZAO_AI_API_KEY" },
      };
    } catch (error) {
      if (error instanceof EZdeployError) throw error;
      throw new EZdeployError("PROVISION_FAILED", `Failed to provision ${request.kind}`, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async deprovision(binding: ResourceBinding): Promise<void> {
    if (binding.kind === "database") {
      await this.cloudflareApi(
        `/accounts/${encodeURIComponent(this.options.accountId)}/d1/database/${encodeURIComponent(binding.externalId)}`,
        { method: "DELETE" },
        true,
      );
      return;
    }
    if (binding.kind === "storage") {
      await this.cloudflareApi(
        `/accounts/${encodeURIComponent(this.options.accountId)}/r2/buckets/${encodeURIComponent(binding.externalId)}`,
        { method: "DELETE" },
        true,
      );
      return;
    }
    if (!this.options.aiIssuer) {
      throw new EZdeployError("PROVIDER_NOT_CONFIGURED", "AI issuer is not configured");
    }
    await this.options.aiIssuer.revoke(binding);
  }

  async prepare(context: DeployContext): Promise<void> {
    const request = context.manifest.spec.resources.find(
      (resource) => resource.kind === "database" && resource.migrationsDirectory,
    );
    if (!request?.migrationsDirectory) return;
    const binding = context.bindings.find((candidate) => candidate.kind === "database");
    if (!binding) throw new Error("Database migration requested without a D1 binding");
    const migrationsDirectory = await resolveInsideProject(
      context.projectDirectory,
      request.migrationsDirectory,
    );
    const stage = path.join(context.projectDirectory, ".zaodeploy", "staging", context.deployment.id);
    await mkdir(stage, { recursive: true });
    const configPath = path.join(stage, "d1-wrangler.json");
    await writeFile(configPath, JSON.stringify({
      name: applicationResourceName(context),
      d1_databases: [{
        binding: binding.configuration.binding,
        database_name: binding.configuration.databaseName,
        database_id: binding.configuration.databaseId,
        migrations_dir: migrationsDirectory,
      }],
    }, null, 2), "utf8");
    const result = await this.wrangler([
      "d1", "migrations", "apply",
      binding.configuration.databaseName ?? binding.externalId,
      "--remote", "--config", configPath,
    ], context.projectDirectory);
    this.preparationLogs.set(context.deployment.id, output(result).split("\n").filter(Boolean));
  }

  async deploy(context: DeployContext): Promise<ProviderDeployment> {
    if (context.manifest.spec.runtime === "cloudflare-workers") {
      return this.deployWorker(context);
    }
    return this.deployPages(context);
  }

  async verify(
    context: DeployContext,
    result: ProviderDeployment,
  ): Promise<VerificationResult> {
    try {
      if (
        context.manifest.spec.access.mode === "organization" &&
        this.options.accessController &&
        !this.options.accessServiceToken
      ) {
        throw new EZdeployError(
          "PROVIDER_NOT_CONFIGURED",
          "Organization deployments require a Cloudflare Access service token for health checks",
        );
      }
      const url = new URL(context.manifest.spec.healthCheck.path, result.url);
      const response = await this.fetchHealthWithRetry(
        url,
        this.options.accessServiceToken
          ? {
              "CF-Access-Client-Id": this.options.accessServiceToken.clientId,
              "CF-Access-Client-Secret": this.options.accessServiceToken.clientSecret,
            }
          : undefined,
        context.manifest.spec.healthCheck.timeoutSeconds * 1000,
      );
      let healthy = response.ok;
      let message = response.ok ? undefined : `Health check returned HTTP ${response.status}`;
      const expectedJson = context.manifest.spec.healthCheck.expectedJson;
      if (healthy && expectedJson) {
        try {
          const actual = await response.clone().json() as Record<string, unknown>;
          const mismatch = Object.entries(expectedJson).find(([key, expected]) => actual[key] !== expected);
          if (mismatch) {
            healthy = false;
            message = `Health response field '${mismatch[0]}' did not match the expected value`;
          }
        } catch {
          healthy = false;
          message = "Health response was not valid JSON";
        }
      }
      if (healthy) {
        await this.options.accessController?.apply({
          applicationSlug: context.applicationSlug,
          environmentName: context.environmentName,
          url: result.url,
          mode: context.manifest.spec.access.mode,
          allowedGroups: context.manifest.spec.access.allowedGroups,
        });
      }
      return {
        healthy,
        statusCode: response.status,
        message,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchHealthWithRetry(
    url: URL,
    headers: Record<string, string> | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = new Error("Health check timed out");
    while (Date.now() < deadline) {
      const controller = new AbortController();
      const attemptTimeout = setTimeout(
        () => controller.abort(),
        Math.min(5_000, Math.max(1, deadline - Date.now())),
      );
      try {
        const response = await this.fetcher(url, { signal: controller.signal, redirect: "follow", headers });
        if (response.status !== 404 && response.status < 500) return response;
        lastError = new Error(`Health check returned HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(attemptTimeout);
      }
      const delayMs = Math.min(1_000, Math.max(0, deadline - Date.now()));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw lastError;
  }

  async destroy(context: DeployContext, _result: ProviderDeployment): Promise<void> {
    const name = applicationResourceName(context);
    if (context.manifest.spec.runtime === "cloudflare-workers") {
      await this.wrangler(["delete", "--name", name], context.projectDirectory, "y\n");
    } else {
      await this.wrangler(
        ["pages", "project", "delete", name, "--yes"],
        context.projectDirectory,
      );
    }
    await this.options.accessController?.remove({
      applicationSlug: context.applicationSlug,
      environmentName: context.environmentName,
    });
  }

  async rollback(context: DeployContext, _result: ProviderDeployment): Promise<ProviderDeployment> {
    if (context.manifest.spec.runtime === "cloudflare-workers") {
      const parts = _result.providerDeploymentId.split(":");
      const versionId = parts.at(-1);
      if (!versionId || !/^[0-9a-f-]{36}$/i.test(versionId)) {
        throw new EZdeployError("DEPLOY_FAILED", "The deployment has no Worker version ID");
      }
      const name = applicationResourceName(context);
      const restored = await this.wrangler(
        ["rollback", versionId, "--name", name, "--yes", "--message", `EZdeploy restore ${context.deployment.id}`],
        context.projectDirectory,
      );
      return {
        providerDeploymentId: `worker:${name}:${versionId}`,
        url: extractDeploymentUrl(output(restored)) ?? _result.url,
      };
    }
    const stage = path.join(
      context.projectDirectory,
      ".zaodeploy",
      "staging",
      context.deployment.id,
    );
    const name = applicationResourceName(context);
    const result = await this.wrangler(
      [
        "pages", "deploy", path.join(stage, "assets"), "--project-name", name,
        "--branch", context.environmentName, "--commit-dirty=true",
      ],
      stage,
    );
    const url = `https://${name}.pages.dev`;
    const deploymentUrl = extractDeploymentUrl(output(result));
    const providerDeploymentId = deploymentUrl
      ? `pages:${name}:restore-${context.deployment.sequence}:${encodeURIComponent(deploymentUrl)}`
      : `pages:${name}:restore-${context.deployment.sequence}`;
    return { providerDeploymentId, url };
  }

  async logs(providerDeploymentId: string): Promise<string[]> {
    return this.logsByDeployment.get(providerDeploymentId) ?? [];
  }

  async runtimeLogs(providerDeploymentId: string): Promise<string[]> {
    const [runtime, name, , encodedDeploymentUrl] = providerDeploymentId.split(":");
    if (!name || (runtime !== "pages" && runtime !== "worker")) return [];
    if (runtime === "pages" && !encodedDeploymentUrl) return [];
    const args = runtime === "pages"
      ? [
          "pages", "deployment", "tail", decodeURIComponent(encodedDeploymentUrl),
          "--project-name", name, "--format", "json",
        ]
      : ["tail", name, "--format", "json"];
    const result = await this.runner.run("npx", ["--no-install", "wrangler", ...args], {
      cwd: process.cwd(),
      env: {
        CLOUDFLARE_ACCOUNT_ID: this.options.accountId,
        CLOUDFLARE_API_TOKEN: this.options.apiToken,
      },
      timeoutMs: this.options.runtimeLogWindowMs ?? 10_000,
      acceptTimeout: true,
    });
    return output(result)
      .split("\n")
      .map((line) => this.redact(line.trim()))
      .filter(Boolean);
  }

  private async createD1(
    context: ProvisionContext,
  ): Promise<Omit<ResourceBinding, "id" | "createdAt">> {
    const databaseName = applicationResourceName(context, "db").slice(0, 32);
    const database = await this.cloudflareApi<{ uuid?: string }>(
      `/accounts/${encodeURIComponent(this.options.accountId)}/d1/database`,
      { method: "POST", body: JSON.stringify({ name: databaseName }) },
    );
    const databaseId = database.uuid;
    if (!databaseId) throw new Error("Cloudflare API did not return the D1 database UUID");
    return {
      applicationId: context.applicationId,
      environmentId: context.environmentId,
      kind: "database",
      provider: "cloudflare-d1",
      externalId: databaseId,
      secretReference: `cloudflare://d1/${databaseId}`,
      configuration: { databaseName, databaseId, binding: "DB" },
    };
  }

  private async createR2(
    context: ProvisionContext,
  ): Promise<Omit<ResourceBinding, "id" | "createdAt">> {
    const bucketName = applicationResourceName(context, "storage");
    const bucket = await this.cloudflareApi<{ name?: string }>(
      `/accounts/${encodeURIComponent(this.options.accountId)}/r2/buckets`,
      { method: "POST", body: JSON.stringify({ name: bucketName }) },
    );
    if (bucket.name !== bucketName) {
      throw new Error("Cloudflare API did not return the created R2 bucket name");
    }
    return {
      applicationId: context.applicationId,
      environmentId: context.environmentId,
      kind: "storage",
      provider: "cloudflare-r2",
      externalId: bucketName,
      secretReference: `cloudflare://r2/${bucketName}`,
      configuration: { bucketName, binding: "STORAGE" },
    };
  }

  private async cloudflareApi<T>(
    pathname: string,
    init: RequestInit,
    ignoreNotFound = false,
  ): Promise<T> {
    const response = await this.apiFetcher(`https://api.cloudflare.com/client/v4${pathname}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.options.apiToken}`,
        ...init.headers,
      },
    });
    if (ignoreNotFound && response.status === 404) return undefined as T;
    let envelope: {
      success?: boolean;
      result?: T;
      errors?: Array<{ code?: number; message?: string }>;
    };
    try {
      envelope = await response.json() as typeof envelope;
    } catch {
      throw new Error(`Cloudflare API returned HTTP ${response.status} with a non-JSON response`);
    }
    if (!response.ok || envelope.success !== true) {
      const details = envelope.errors?.map((error) =>
        `${error.code ?? "unknown"}: ${error.message ?? "unknown error"}`,
      ).join("; ");
      throw new Error(`Cloudflare API request failed with HTTP ${response.status}${details ? ` (${details})` : ""}`);
    }
    return envelope.result as T;
  }

  private async deployPages(context: DeployContext): Promise<ProviderDeployment> {
    const operationLogs: string[] = [...(this.preparationLogs.get(context.deployment.id) ?? [])];
    if (context.manifest.spec.buildCommand) {
      const command = buildCommand(context.manifest.spec.buildCommand);
      operationLogs.push(...await this.installDependencies(context.projectDirectory, command.executable));
      if (!(await this.isPrebuilt(context.projectDirectory))) {
        const build = await this.runner.run(command.executable, command.args, {
          cwd: context.projectDirectory,
          inheritEnv: false,
          env: applicationBuildEnvironment(),
        });
        operationLogs.push(...output(build).split("\n").filter(Boolean));
      } else {
        operationLogs.push("Using Agent Gateway prebuilt application output");
      }
    }
    const outputDirectory = await resolveInsideProject(
      context.projectDirectory,
      context.manifest.spec.outputDirectory ??
        (context.manifest.spec.runtime === "vite" ? "dist" : "."),
    );
    const name = applicationResourceName(context);
    const stage = path.join(
      context.projectDirectory,
      ".zaodeploy",
      "staging",
      context.deployment.id,
    );
    await mkdir(stage, { recursive: true });
    const archivedAssets = path.join(stage, "assets");
    await rm(archivedAssets, { recursive: true, force: true });
    const internalDirectory = path.join(context.projectDirectory, ".zaodeploy");
    await cp(outputDirectory, archivedAssets, {
      recursive: true,
      filter: (source) => !source.startsWith(internalDirectory),
    });
    try {
      await cp(path.join(context.projectDirectory, "functions"), path.join(stage, "functions"), {
        recursive: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await writeFile(
      path.join(stage, "wrangler.json"),
      JSON.stringify(this.pagesConfiguration(name, archivedAssets, context.bindings), null, 2),
      "utf8",
    );
    await this.ensurePagesProject(name, context.environmentName, stage);
    const ai = context.bindings.find((binding) => binding.kind === "ai");
    if (ai) {
      if (!this.options.secretStore) {
        throw new EZdeployError(
          "PROVIDER_NOT_CONFIGURED",
          "A secret store is required to inject an application AI credential",
        );
      }
      const virtualKey = await this.options.secretStore.get(ai.secretReference);
      await this.wrangler(
        ["pages", "secret", "put", ai.configuration.binding ?? "ZAO_AI_API_KEY", "--project-name", name],
        stage,
        `${virtualKey}\n`,
      );
    }
    const result = await this.wrangler(
      [
        "pages",
        "deploy",
        archivedAssets,
        "--project-name",
        name,
        "--branch",
        context.environmentName,
        "--commit-dirty=true",
      ],
      stage,
    );
    const commandOutput = output(result);
    operationLogs.push(...commandOutput.split("\n").filter(Boolean));
    const url = `https://${name}.pages.dev`;
    const deploymentUrl = extractDeploymentUrl(commandOutput);
    if (!deploymentUrl) throw new Error("Wrangler did not return a Pages deployment URL");
    const providerDeploymentId = `pages:${name}:${context.deployment.sequence}:${encodeURIComponent(deploymentUrl)}`;
    this.logsByDeployment.set(providerDeploymentId, operationLogs.map((line) => this.redact(line)));
    return { providerDeploymentId, url };
  }

  private async ensurePagesProject(
    name: string,
    productionBranch: string,
    workingDirectory: string,
  ): Promise<void> {
    const pathname = `/accounts/${encodeURIComponent(this.options.accountId)}/pages/projects/${encodeURIComponent(name)}`;
    const existing = await this.cloudflareApi<{ name?: string }>(pathname, { method: "GET" }, true);
    if (existing) return;
    await this.wrangler(
      ["pages", "project", "create", name, "--production-branch", productionBranch],
      workingDirectory,
    );
  }

  private async deployWorker(context: DeployContext): Promise<ProviderDeployment> {
    const operationLogs: string[] = [...(this.preparationLogs.get(context.deployment.id) ?? [])];
    operationLogs.push(...await this.installDependencies(context.projectDirectory));
    const name = applicationResourceName(context);
    const configPath = await this.workerConfiguration(context, name);
    let result = await this.wrangler(
      ["deploy", "--name", name, "--config", configPath],
      context.projectDirectory,
    );
    const ai = context.bindings.find((binding) => binding.kind === "ai");
    if (ai) {
      if (!this.options.secretStore) {
        throw new EZdeployError("PROVIDER_NOT_CONFIGURED", "A secret store is required for AI");
      }
      await this.wrangler(
        ["secret", "put", ai.configuration.binding ?? "ZAO_AI_API_KEY", "--name", name],
        context.projectDirectory,
        `${await this.options.secretStore.get(ai.secretReference)}\n`,
      );
      result = await this.wrangler(
        ["deploy", "--name", name, "--config", configPath],
        context.projectDirectory,
      );
    }
    const commandOutput = output(result);
    operationLogs.push(...commandOutput.split("\n").filter(Boolean));
    const url = extractDeploymentUrl(commandOutput);
    if (!url) throw new Error("Wrangler did not return a workers.dev URL");
    const versionId = extractVersionId(commandOutput);
    if (!versionId) throw new Error("Wrangler did not return a Worker Version ID");
    const providerDeploymentId = `worker:${name}:${versionId}`;
    this.logsByDeployment.set(providerDeploymentId, operationLogs.map((line) => this.redact(line)));
    return { providerDeploymentId, url };
  }

  private async workerConfiguration(context: DeployContext, name: string): Promise<string> {
    const candidates = ["wrangler.json", "wrangler.jsonc"];
    let sourcePath: string | undefined;
    let source = "";
    for (const candidate of candidates) {
      try {
        sourcePath = path.join(context.projectDirectory, candidate);
        source = await readFile(sourcePath, "utf8");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        sourcePath = undefined;
      }
    }
    if (!sourcePath) {
      throw new EZdeployError(
        "MANIFEST_INVALID",
        "cloudflare-workers runtime requires wrangler.json or wrangler.jsonc",
      );
    }
    const config = parseJsonc(source) as Record<string, unknown>;
    if (!config || typeof config !== "object" || typeof config.main !== "string") {
      throw new EZdeployError("MANIFEST_INVALID", "Wrangler config must declare a main entrypoint");
    }
    const database = context.bindings.find((binding) => binding.kind === "database");
    const storage = context.bindings.find((binding) => binding.kind === "storage");
    const ai = context.bindings.find((binding) => binding.kind === "ai");
    const generated = {
      ...config,
      name,
      observability: { ...((config.observability as object | undefined) ?? {}), enabled: true },
      main: await resolveInsideProject(context.projectDirectory, config.main),
      ...(database
        ? { d1_databases: [{
            binding: database.configuration.binding,
            database_name: database.configuration.databaseName,
            database_id: database.configuration.databaseId,
          }] }
        : {}),
      ...(storage
        ? { r2_buckets: [{
            binding: storage.configuration.binding,
            bucket_name: storage.configuration.bucketName,
          }] }
        : {}),
      ...(ai ? { vars: { ...((config.vars as object | undefined) ?? {}), ZAO_AI_BASE_URL: ai.configuration.baseUrl } } : {}),
    };
    const stage = path.join(context.projectDirectory, ".zaodeploy", "staging", context.deployment.id);
    await mkdir(stage, { recursive: true });
    const target = path.join(stage, "worker-wrangler.json");
    await writeFile(target, JSON.stringify(generated, null, 2), "utf8");
    return target;
  }

  private async installDependencies(
    projectDirectory: string,
    preferredManager?: string,
  ): Promise<string[]> {
    try {
      await access(path.join(projectDirectory, "node_modules"));
      return [];
    } catch {}
    let packageJson: { dependencies?: object; devDependencies?: object };
    try {
      packageJson = JSON.parse(await readFile(path.join(projectDirectory, "package.json"), "utf8")) as typeof packageJson;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    if (
      Object.keys(packageJson.dependencies ?? {}).length === 0 &&
      Object.keys(packageJson.devDependencies ?? {}).length === 0
    ) return [];

    const exists = async (filename: string) => {
      try { await access(path.join(projectDirectory, filename)); return true; } catch { return false; }
    };
    let command: string;
    let args: string[];
    if (preferredManager === "pnpm" || await exists("pnpm-lock.yaml")) {
      command = "pnpm";
      args = ["install", ...(await exists("pnpm-lock.yaml") ? ["--frozen-lockfile"] : []), "--ignore-scripts"];
    } else if (preferredManager === "yarn" || await exists("yarn.lock")) {
      command = "yarn";
      args = ["install", ...(await exists("yarn.lock") ? ["--frozen-lockfile"] : []), "--ignore-scripts"];
    } else if (preferredManager === "bun" || await exists("bun.lock") || await exists("bun.lockb")) {
      command = "bun";
      args = ["install", ...(await exists("bun.lock") || await exists("bun.lockb") ? ["--frozen-lockfile"] : []), "--ignore-scripts"];
    } else {
      command = "npm";
      args = await exists("package-lock.json")
        ? ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]
        : ["install", "--ignore-scripts", "--no-audit", "--no-fund"];
    }
    const result = await this.runner.run(command, args, {
      cwd: projectDirectory,
      inheritEnv: false,
      env: applicationBuildEnvironment("development"),
    });
    return output(result).split("\n").filter(Boolean);
  }

  private async isPrebuilt(projectDirectory: string): Promise<boolean> {
    try {
      await access(path.join(projectDirectory, ".zaodeploy", "prebuilt"));
      return true;
    } catch {
      return false;
    }
  }

  private pagesConfiguration(
    name: string,
    outputDirectory: string,
    bindings: ResourceBinding[],
  ): Record<string, unknown> {
    const database = bindings.find((binding) => binding.kind === "database");
    const storage = bindings.find((binding) => binding.kind === "storage");
    const ai = bindings.find((binding) => binding.kind === "ai");
    return {
      name,
      pages_build_output_dir: outputDirectory,
      ...(database
        ? {
            d1_databases: [
              {
                binding: database.configuration.binding,
                database_name: database.configuration.databaseName,
                database_id: database.configuration.databaseId,
              },
            ],
          }
        : {}),
      ...(storage
        ? {
            r2_buckets: [
              {
                binding: storage.configuration.binding,
                bucket_name: storage.configuration.bucketName,
              },
            ],
          }
        : {}),
      ...(ai ? { vars: { ZAO_AI_BASE_URL: ai.configuration.baseUrl } } : {}),
    };
  }

  private wrangler(args: string[], cwd: string, stdin?: string): Promise<CommandResult> {
    return this.runner.run("npx", ["--no-install", "wrangler", ...args], {
      cwd,
      env: {
        CLOUDFLARE_ACCOUNT_ID: this.options.accountId,
        CLOUDFLARE_API_TOKEN: this.options.apiToken,
      },
      stdin,
    });
  }

  private redact(value: string): string {
    let redacted = value.replaceAll(this.options.apiToken, "[REDACTED]");
    if (this.options.accessServiceToken) {
      redacted = redacted
        .replaceAll(this.options.accessServiceToken.clientId, "[REDACTED_ACCESS_CLIENT]")
        .replaceAll(this.options.accessServiceToken.clientSecret, "[REDACTED_ACCESS_SECRET]");
    }
    return redacted
      .replace(/zai_[A-Za-z0-9_-]+/g, "[REDACTED_APP_KEY]")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
  }
}
