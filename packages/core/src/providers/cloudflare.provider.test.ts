import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResourceBinding } from "@ezdeploy/contracts";
import { DeploymentOrchestrator } from "../orchestrator.js";
import { ControlPlaneRepository } from "../repository.js";
import type { CommandOptions, CommandResult, CommandRunner } from "./command-runner.js";
import { CloudflareDeployProvider } from "./cloudflare.provider.js";
import type { SecretStore } from "../secrets.js";

class FakeRunner implements CommandRunner {
  calls: Array<{ command: string; args: string[]; options: CommandOptions }> = [];

  async run(
    command: string,
    args: string[],
    options: CommandOptions,
  ): Promise<CommandResult> {
    this.calls.push({ command, args, options });
    const joined = args.join(" ");
    if (joined.includes("wrangler pages deploy ")) {
      return {
        stdout: "Deployment complete: https://abc123.cloudflare-example-production.pages.dev provider-master-token access-client-secret",
        stderr: "",
      };
    }
    if (joined.includes("wrangler deploy")) {
      return {
        stdout: "Uploaded worker\nVersion ID: 22222222-2222-4222-8222-222222222222\nhttps://cloudflare-example-production.example.workers.dev",
        stderr: "",
      };
    }
    if (joined.includes(" tail ") || joined.includes("deployment tail")) {
      return {
        stdout: JSON.stringify({
          message: "Bearer provider-master-token zai_runtime-secret access-client-id access-client-secret",
        }),
        stderr: "",
      };
    }
    return { stdout: "ok", stderr: "" };
  }
}

function fakeCloudflareApi(
  calls: Array<{ url: string; init?: RequestInit }> = [],
): typeof globalThis.fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    if (init?.method === "POST" && url.endsWith("/d1/database")) {
      return Response.json({
        success: true,
        result: {
          uuid: "11111111-1111-4111-8111-111111111111",
          name: "cloudflare-example-production-db",
        },
      });
    }
    if (init?.method === "POST" && url.endsWith("/r2/buckets")) {
      return Response.json({
        success: true,
        result: { name: "cloudflare-example-production-storage" },
      });
    }
    if (init?.method === "GET" && url.includes("/pages/projects/")) {
      return new Response(null, { status: 404 });
    }
    if (init?.method === "DELETE") return Response.json({ success: true, result: null });
    return Response.json({ success: false, errors: [{ code: 1000, message: "unexpected test request" }] }, { status: 400 });
  };
}

const manifest = `
apiVersion: ezdeploy.io/v1alpha1
kind: Application
metadata:
  name: cloudflare-example
spec:
  runtime: vite
  buildCommand: npm run build
  outputDirectory: dist
  resources:
    - kind: database
    - kind: storage
  access:
    mode: organization
`;

class MemorySecretStore implements SecretStore {
  async put(_value: string) { return "secret://local/ai"; }
  async get(_reference: string) { return "zai_scoped-application-key"; }
  async delete(_reference: string) {}
}

describe("CloudflareDeployProvider", () => {
  let projectDirectory: string;
  let repository: ControlPlaneRepository;

  beforeEach(async () => {
    projectDirectory = await mkdtemp(path.join(os.tmpdir(), "zaodeploy-cloudflare-"));
    await mkdir(path.join(projectDirectory, "dist"));
    await writeFile(path.join(projectDirectory, "dist", "index.html"), "ready", "utf8");
    await writeFile(path.join(projectDirectory, "ezdeploy.yaml"), manifest, "utf8");
    repository = new ControlPlaneRepository(":memory:");
  });

  afterEach(async () => {
    repository.close();
    await rm(projectDirectory, { recursive: true, force: true });
  });

  it("provisions D1/R2, writes server-side bindings, deploys Pages, and verifies health", async () => {
    const runner = new FakeRunner();
    const apiCalls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new CloudflareDeployProvider({
      accountId: "account-id",
      apiToken: "provider-master-token",
      runner,
      fetch: async () => new Response("ok", { status: 200 }),
      apiFetch: fakeCloudflareApi(apiCalls),
      accessServiceToken: { clientId: "access-client-id", clientSecret: "access-client-secret" },
    });
    const orchestrator = new DeploymentOrchestrator(repository, provider);

    const result = await orchestrator.deploy({
      projectDirectory,
      ownerId: "employee@example.com",
    });

    expect(result.deployment).toMatchObject({
      status: "ready",
      url: "https://cloudflare-example-production.pages.dev",
    });
    expect(runner.calls.map((call) => call.args.join(" "))).toEqual(
      expect.arrayContaining([
        "run build",
        expect.stringContaining("wrangler pages deploy"),
      ]),
    );
    expect(apiCalls.map((call) => `${call.init?.method} ${call.url}`)).toEqual([
      "POST https://api.cloudflare.com/client/v4/accounts/account-id/d1/database",
      "POST https://api.cloudflare.com/client/v4/accounts/account-id/r2/buckets",
      "GET https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/cloudflare-example-production",
    ]);
    expect(apiCalls.map((call) => call.init?.body)).toEqual([
      JSON.stringify({ name: "cloudflare-example-production-db" }),
      JSON.stringify({ name: "cloudflare-example-production-storage" }),
      undefined,
    ]);
    expect(runner.calls.map((call) => call.args.join(" "))).toContain(
      "--no-install wrangler pages project create cloudflare-example-production --production-branch production",
    );
    expect(JSON.stringify(apiCalls.map((call) => call.init?.body))).not.toContain("provider-master-token");
    const deployCall = runner.calls.find((call) => call.args.includes("deploy"));
    expect(deployCall).toBeDefined();
    expect(JSON.stringify(deployCall?.args)).not.toContain("provider-master-token");
    const buildCall = runner.calls.find((call) => call.command === "npm");
    expect(buildCall?.options.inheritEnv).toBe(false);
    expect(buildCall?.options.env).not.toHaveProperty("CLOUDFLARE_API_TOKEN");

    const configPath = path.join(
      projectDirectory,
      ".zaodeploy",
      "staging",
      result.deployment.id,
      "wrangler.json",
    );
    const config = JSON.parse(await readFile(configPath, "utf8")) as {
      d1_databases: Array<{ binding: string; database_id: string }>;
      r2_buckets: Array<{ binding: string; bucket_name: string }>;
    };
    expect(config.d1_databases[0]).toEqual({
      binding: "DB",
      database_name: "cloudflare-example-production-db",
      database_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(config.r2_buckets[0]).toEqual({
      binding: "STORAGE",
      bucket_name: "cloudflare-example-production-storage",
    });
    const logs = await orchestrator.getLogs(result.deployment.id);
    expect(JSON.stringify(logs.provider)).not.toContain("provider-master-token");
    expect(JSON.stringify(logs.provider)).not.toContain("access-client-secret");
    expect(logs.runtime.join("\n")).toContain("Bearer [REDACTED]");
    expect(logs.runtime.join("\n")).not.toContain("provider-master-token");
    expect(logs.runtime.join("\n")).not.toContain("zai_runtime-secret");
    expect(logs.runtime.join("\n")).not.toContain("access-client-id");
    expect(logs.runtime.join("\n")).not.toContain("access-client-secret");
    expect(runner.calls.map((call) => call.args.join(" "))).toContain(
      "--no-install wrangler pages deployment tail https://abc123.cloudflare-example-production.pages.dev --project-name cloudflare-example-production --format json",
    );
  });

  it("deprovisions D1/R2 through idempotent API calls", async () => {
    const apiCalls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new CloudflareDeployProvider({
      accountId: "account/id",
      apiToken: "provider-master-token",
      runner: new FakeRunner(),
      apiFetch: async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        apiCalls.push({ url, init });
        return new Response(null, { status: 404 });
      },
    });
    const common = {
      id: "11111111-1111-4111-8111-111111111111",
      applicationId: "22222222-2222-4222-8222-222222222222",
      environmentId: "33333333-3333-4333-8333-333333333333",
      secretReference: "cloudflare://resource/example",
      configuration: {},
      createdAt: new Date().toISOString(),
    };
    await provider.deprovision({
      ...common, kind: "database", provider: "cloudflare-d1", externalId: "database/id",
    } satisfies ResourceBinding);
    await provider.deprovision({
      ...common, kind: "storage", provider: "cloudflare-r2", externalId: "bucket name",
    } satisfies ResourceBinding);
    expect(apiCalls.map((call) => `${call.init?.method} ${call.url}`)).toEqual([
      "DELETE https://api.cloudflare.com/client/v4/accounts/account%2Fid/d1/database/database%2Fid",
      "DELETE https://api.cloudflare.com/client/v4/accounts/account%2Fid/r2/buckets/bucket%20name",
    ]);
  });

  it("rejects shell build commands instead of executing arbitrary manifest content", async () => {
    await writeFile(
      path.join(projectDirectory, "ezdeploy.yaml"),
      manifest.replace("npm run build", "npm run build && printenv"),
      "utf8",
    );
    const provider = new CloudflareDeployProvider({
      accountId: "account-id",
      apiToken: "token",
      runner: new FakeRunner(),
      fetch: async () => new Response("ok", { status: 200 }),
      apiFetch: fakeCloudflareApi(),
    });

    await expect(
      new DeploymentOrchestrator(repository, provider).deploy({
        projectDirectory,
        ownerId: "employee@example.com",
      }),
    ).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
  });

  it("rejects output directories that escape the project", async () => {
    await writeFile(
      path.join(projectDirectory, "ezdeploy.yaml"),
      manifest.replace("outputDirectory: dist", "outputDirectory: .."),
      "utf8",
    );
    const provider = new CloudflareDeployProvider({
      accountId: "account-id",
      apiToken: "token",
      runner: new FakeRunner(),
      fetch: async () => new Response("ok"),
      apiFetch: fakeCloudflareApi(),
    });
    await expect(new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory,
      ownerId: "owner",
    })).rejects.toMatchObject({ code: "MANIFEST_INVALID" });
  });

  it("applies declared D1 migrations before publishing the release", async () => {
    await mkdir(path.join(projectDirectory, "migrations"));
    await writeFile(
      path.join(projectDirectory, "migrations", "0001.sql"),
      "CREATE TABLE example (id INTEGER PRIMARY KEY);",
      "utf8",
    );
    await writeFile(
      path.join(projectDirectory, "ezdeploy.yaml"),
      manifest.replace("    - kind: database", "    - kind: database\n      migrationsDirectory: migrations"),
      "utf8",
    );
    const runner = new FakeRunner();
    const provider = new CloudflareDeployProvider({
      accountId: "account-id", apiToken: "token", runner,
      fetch: async () => new Response("ok"),
      apiFetch: fakeCloudflareApi(),
    });
    await new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory, ownerId: "owner",
    });
    const commands = runner.calls.map((call) => call.args.join(" "));
    const migrationIndex = commands.findIndex((command) => command.includes("d1 migrations apply"));
    const deployIndex = commands.findIndex((command) => command.includes("wrangler pages deploy "));
    expect(migrationIndex).toBeGreaterThan(-1);
    expect(migrationIndex).toBeLessThan(deployIndex);
  });

  it("fails readiness when declared JSON capability checks do not pass", async () => {
    await writeFile(
      path.join(projectDirectory, "ezdeploy.yaml"),
      `${manifest}\n  healthCheck:\n    path: /api/status\n    expectedJson:\n      database: true\n`,
      "utf8",
    );
    const provider = new CloudflareDeployProvider({
      accountId: "account-id", apiToken: "token", runner: new FakeRunner(),
      fetch: async () => Response.json({ database: false }),
      apiFetch: fakeCloudflareApi(),
    });
    await expect(new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory, ownerId: "owner",
    })).rejects.toMatchObject({ code: "HEALTH_CHECK_FAILED" });
  });

  it("retries transient network and server errors while Pages becomes available", async () => {
    let attempts = 0;
    const provider = new CloudflareDeployProvider({
      accountId: "account-id", apiToken: "token", runner: new FakeRunner(),
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) return new Response("starting", { status: 503 });
        return new Response("ok", { status: 200 });
      },
      apiFetch: fakeCloudflareApi(),
    });
    const result = await new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory, ownerId: "owner",
    });
    expect(result.deployment.status).toBe("ready");
    expect(attempts).toBe(2);
  });

  it("does not execute a project build script for Gateway-prebuilt source", async () => {
    await mkdir(path.join(projectDirectory, ".zaodeploy"), { recursive: true });
    await writeFile(path.join(projectDirectory, ".zaodeploy", "prebuilt"), "digest", "utf8");
    const runner = new FakeRunner();
    const provider = new CloudflareDeployProvider({
      accountId: "account-id", apiToken: "token", runner,
      fetch: async () => new Response("ok"),
      apiFetch: fakeCloudflareApi(),
    });
    await new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory, ownerId: "owner",
    });
    expect(runner.calls.some((call) => call.command === "npm")).toBe(false);
  });

  it("injects a scoped AI key through stdin without writing it to args or config", async () => {
    await writeFile(
      path.join(projectDirectory, "ezdeploy.yaml"),
      manifest.replace("    - kind: storage", "    - kind: storage\n    - kind: ai"),
      "utf8",
    );
    const runner = new FakeRunner();
    const provider = new CloudflareDeployProvider({
      accountId: "account-id",
      apiToken: "provider-master-token",
      runner,
      secretStore: new MemorySecretStore(),
      aiIssuer: {
        async issue(context) {
          return {
            externalId: `credential-${context.applicationId}`,
            secretReference: "secret://local/ai",
            baseUrl: "https://ai.internal.example/v1",
          };
        },
        async revoke() {},
      },
      fetch: async () => new Response("ok", { status: 200 }),
      apiFetch: fakeCloudflareApi(),
    });
    const result = await new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory,
      ownerId: "employee@example.com",
    });
    const secretCall = runner.calls.find((call) => call.args.includes("secret"));
    expect(secretCall?.args.join(" ")).toContain(
      "wrangler pages secret put ZAO_AI_API_KEY --project-name cloudflare-example-production",
    );
    expect(secretCall?.options.stdin).toBe("zai_scoped-application-key\n");
    const secretIndex = runner.calls.indexOf(secretCall!);
    const deployIndex = runner.calls.findIndex((call) => call.args.includes("deploy"));
    expect(secretIndex).toBeLessThan(deployIndex);
    expect(JSON.stringify(runner.calls.map((call) => call.args))).not.toContain(
      "zai_scoped-application-key",
    );
    const configPath = path.join(
      projectDirectory,
      ".zaodeploy",
      "staging",
      result.deployment.id,
      "wrangler.json",
    );
    const config = await readFile(configPath, "utf8");
    expect(config).toContain("https://ai.internal.example/v1");
    expect(config).not.toContain("zai_scoped-application-key");
  });

  it("merges D1/R2 into an isolated Worker config and captures a rollback version", async () => {
    await writeFile(
      path.join(projectDirectory, "ezdeploy.yaml"),
      manifest.replace("runtime: vite", "runtime: cloudflare-workers")
        .replace("  buildCommand: npm run build\n", "")
        .replace("  outputDirectory: dist\n", ""),
      "utf8",
    );
    await writeFile(
      path.join(projectDirectory, "wrangler.jsonc"),
      `{ // project config\n "main": "src/worker.ts", "compatibility_date": "2026-07-15" }`,
      "utf8",
    );
    await mkdir(path.join(projectDirectory, "src"), { recursive: true });
    await writeFile(path.join(projectDirectory, "src", "worker.ts"), "export default {}", "utf8");
    const runner = new FakeRunner();
    const provider = new CloudflareDeployProvider({
      accountId: "account-id",
      apiToken: "token",
      runner,
      fetch: async () => new Response("ok"),
      apiFetch: fakeCloudflareApi(),
    });
    const result = await new DeploymentOrchestrator(repository, provider).deploy({
      projectDirectory,
      ownerId: "owner",
    });
    expect(result.deployment.providerDeploymentId).toBe(
      "worker:cloudflare-example-production:22222222-2222-4222-8222-222222222222",
    );
    const deployCall = runner.calls.find((call) =>
      call.args.join(" ").includes("wrangler deploy"),
    );
    const configPath = deployCall?.args.at(-1);
    expect(configPath).toBeTruthy();
    const config = JSON.parse(await readFile(configPath!, "utf8")) as Record<string, unknown>;
    expect(config).toMatchObject({
      name: "cloudflare-example-production",
      d1_databases: [{ binding: "DB", database_id: "11111111-1111-4111-8111-111111111111" }],
      r2_buckets: [{ binding: "STORAGE", bucket_name: "cloudflare-example-production-storage" }],
    });
    await new DeploymentOrchestrator(repository, provider).rollbackDeployment(result.deployment.id);
    expect(runner.calls.some((call) => call.args.join(" ").includes(
      "wrangler rollback 22222222-2222-4222-8222-222222222222",
    ))).toBe(true);
  });
});
