#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { zaoDeployManifestSchema, EZdeployError } from "@ezdeploy/contracts";
import {
  ControlPlaneRepository,
  createProviderFromEnvironment,
  DeploymentOrchestrator,
} from "@ezdeploy/core";
import { x as extractArchive } from "tar";

export interface ControlPlaneServerOptions {
  tokenHashes: Record<string, string>;
  sourceRoot: string;
  maxArchiveBytes?: number;
  adminOwnerIds?: string[];
}

export function createControlPlaneServer(
  orchestrator: DeploymentOrchestrator,
  options: ControlPlaneServerOptions,
) {
  return createServer(async (request, response) => {
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    try {
      const url = new URL(request.url ?? "/", "http://control-plane.local");
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok" });
      }
      const ownerId = authenticate(request, options.tokenHashes);
      if (!ownerId) return json(response, 401, { error: { code: "UNAUTHORIZED", message: "Invalid deployment token" } });

      if (request.method === "POST" && url.pathname === "/v1/plan") {
        const manifest = zaoDeployManifestSchema.parse(
          JSON.parse((await readBody(request, 1_048_576)).toString("utf8")),
        );
        return json(response, 200, orchestrator.planManifest(manifest));
      }
      if (request.method === "POST" && url.pathname === "/v1/deployments") {
        const archive = await readBody(request, options.maxArchiveBytes ?? 25 * 1024 * 1024);
        const expectedDigest = request.headers["x-zaodeploy-source-sha256"];
        const actualDigest = createHash("sha256").update(archive).digest("hex");
        if (typeof expectedDigest !== "string" || expectedDigest !== actualDigest) {
          throw new EZdeployError("MANIFEST_INVALID", "Source archive digest mismatch");
        }
        const sourceDirectory = path.join(options.sourceRoot, randomUUID());
        await mkdir(sourceDirectory, { recursive: true, mode: 0o700 });
        try {
          const archivePath = path.join(sourceDirectory, "source.tgz");
          await writeFile(archivePath, archive, { mode: 0o600 });
          await extractArchive({
            cwd: sourceDirectory,
            file: archivePath,
            strict: true,
            preservePaths: false,
            filter: (_entryPath, entry) => {
              if ("type" in entry && ["SymbolicLink", "Link"].includes(entry.type)) {
                throw new EZdeployError("MANIFEST_INVALID", "Source archives may not contain links");
              }
              return true;
            },
          });
          await rm(archivePath, { force: true });
          if (request.headers["x-zaodeploy-prebuilt"] === "true") {
            const markerDirectory = path.join(sourceDirectory, ".zaodeploy");
            await mkdir(markerDirectory, { recursive: true, mode: 0o700 });
            await writeFile(path.join(markerDirectory, "prebuilt"), actualDigest, { mode: 0o600 });
          }
          const result = await orchestrator.deploy({
            projectDirectory: sourceDirectory,
            ownerId,
            environment: url.searchParams.get("environment") ?? "production",
          });
          return json(response, 201, result);
        } catch (error) {
          await rm(sourceDirectory, { recursive: true, force: true });
          throw error;
        }
      }
      if (request.method === "GET" && url.pathname === "/v1/apps") {
        return json(response, 200, orchestrator.listApplications());
      }
      const match = /^\/v1\/deployments\/([0-9a-f-]{36})(?:\/(logs|rollback))?$/.exec(url.pathname);
      if (match) {
        const [, id, operation] = match;
        if (request.method === "GET" && (!operation || operation === "logs")) {
          if (!canManage(orchestrator, id, ownerId, options.adminOwnerIds ?? [])) {
            return json(response, 403, { error: { code: "FORBIDDEN", message: "Only the owner or an administrator can view deployment details and logs" } });
          }
          if (!operation) return json(response, 200, orchestrator.getDeployment(id));
          return json(response, 200, await orchestrator.getLogs(id));
        }
        if (request.method === "POST" && operation === "rollback") {
          if (!canManage(orchestrator, id, ownerId, options.adminOwnerIds ?? [])) {
            return json(response, 403, { error: { code: "FORBIDDEN", message: "Only the owner or an administrator can restore this application" } });
          }
          return json(response, 200, await orchestrator.rollbackDeployment(id));
        }
        if (request.method === "DELETE" && !operation) {
          if (!canManage(orchestrator, id, ownerId, options.adminOwnerIds ?? [])) {
            return json(response, 403, { error: { code: "FORBIDDEN", message: "Only the owner or an administrator can delete this application" } });
          }
          const sourceDirectories = orchestrator.getEnvironmentSourceDirectories(id);
          const result = await orchestrator.deleteDeployment(
            id,
            url.searchParams.get("removeResources") === "true",
          );
          await Promise.all(sourceDirectories
            .filter((directory) => isInside(options.sourceRoot, directory))
            .map((directory) => rm(directory, { recursive: true, force: true })));
          return json(response, 200, result);
        }
      }
      return json(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
    } catch (error) {
      const structured = error instanceof EZdeployError
        ? error
        : new EZdeployError("DEPLOY_FAILED", "Control-plane request failed", {
            cause: error instanceof Error ? error.message : String(error),
          });
      const status = structured.code === "FORBIDDEN"
        ? 403
        : structured.code === "DEPLOYMENT_NOT_FOUND"
          ? 404
          : 400;
      return json(response, status, { error: { code: structured.code, message: structured.message, details: structured.details } });
    }
  });
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function canManage(
  orchestrator: DeploymentOrchestrator,
  deploymentId: string,
  ownerId: string,
  administrators: string[],
): boolean {
  return administrators.includes(ownerId) || orchestrator.getDeploymentOwner(deploymentId) === ownerId;
}

function authenticate(request: IncomingMessage, tokenHashes: Record<string, string>): string | null {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const hash = createHash("sha256").update(authorization.slice(7)).digest("hex");
  return tokenHashes[hash] ?? null;
}

async function readBody(request: IncomingMessage, maximum: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    length += buffer.length;
    if (length > maximum) {
      request.destroy();
      throw new EZdeployError("MANIFEST_INVALID", `Request body exceeds ${maximum} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function main(): void {
  const tokenHashes = JSON.parse(process.env.ZAODEPLOY_MCP_TOKEN_HASHES ?? "{}") as Record<string, string>;
  if (Object.keys(tokenHashes).length === 0) {
    throw new Error("ZAODEPLOY_MCP_TOKEN_HASHES must map SHA-256 token hashes to employee IDs");
  }
  const repository = new ControlPlaneRepository(
    path.resolve(process.env.ZAODEPLOY_DATABASE_PATH ?? ".zaodeploy/control-plane.db"),
  );
  const orchestrator = new DeploymentOrchestrator(repository, createProviderFromEnvironment());
  const server = createControlPlaneServer(orchestrator, {
    tokenHashes,
    sourceRoot: path.resolve(process.env.ZAODEPLOY_SOURCE_ROOT ?? ".zaodeploy/sources"),
    adminOwnerIds: (process.env.ZAODEPLOY_ADMIN_OWNER_IDS ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean),
  });
  server.listen(Number(process.env.PORT ?? 8790), process.env.HOST ?? "127.0.0.1");
  const shutdown = () => server.close(() => repository.close());
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
