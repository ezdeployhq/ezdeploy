import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createControlPlaneServer } from "../apps/control-plane/src/server.js";
import { RemoteDeploymentService } from "../apps/mcp-server/src/remote-service.js";
import { createServer as createMcpServer } from "../apps/mcp-server/src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ControlPlaneRepository, DeploymentOrchestrator, MockDeployProvider } from "@ezdeploy/core";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("remote agent gateway to control plane", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => { while (cleanups.length) await cleanups.pop()?.(); });

  it("uploads a filtered source archive, derives ownership from a scoped token, and enforces owner mutations", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "zaodeploy-remote-"));
    const project = path.join(root, "project");
    const sources = path.join(root, "sources");
    await mkdir(path.join(project, "public"), { recursive: true });
    await mkdir(path.join(project, "node_modules", "private-package"), { recursive: true });
    await writeFile(path.join(project, "public", "index.html"), "ready", "utf8");
    await writeFile(path.join(project, "package.json"), JSON.stringify({
      private: true,
      scripts: { build: "node build.mjs" },
    }), "utf8");
    await writeFile(
      path.join(project, "build.mjs"),
      "import{writeFile}from'node:fs/promises';await writeFile('public/build-env.txt',process.env.CLOUDFLARE_API_TOKEN??'isolated')",
      "utf8",
    );
    await writeFile(path.join(project, ".env"), "MASTER_SECRET=must-not-upload", "utf8");
    await writeFile(path.join(project, "node_modules", "private-package", "secret"), "no", "utf8");
    await writeFile(path.join(project, "ezdeploy.yaml"), `
apiVersion: ezdeploy.io/v1alpha1
kind: Application
metadata:
  name: remote-static-example
spec:
  runtime: vite
  buildCommand: npm run build
  outputDirectory: public
  access:
    mode: public
`, "utf8");

    const repository = new ControlPlaneRepository(":memory:");
    const orchestrator = new DeploymentOrchestrator(repository, new MockDeployProvider());
    const server = createControlPlaneServer(orchestrator, {
      tokenHashes: {
        [hash("employee-token")]: "employee@example.com",
        [hash("other-token")]: "other@example.com",
      },
      sourceRoot: sources,
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    cleanups.push(() => repository.close());
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const employee = new RemoteDeploymentService({ baseUrl, token: "employee-token" });
    const mcpServer = createMcpServer(employee, { ownerIdRequired: false });
    const mcpClient = new Client({ name: "remote-flow-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([mcpServer.connect(serverTransport), mcpClient.connect(clientTransport)]);
    cleanups.push(() => mcpClient.close());
    cleanups.push(() => mcpServer.close());

    const previousProviderToken = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = "must-not-reach-build";
    let toolResult;
    try {
      toolResult = await mcpClient.callTool({ name: "deploy_to_zaodeploy", arguments: { projectDirectory: project } });
    } finally {
      if (previousProviderToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = previousProviderToken;
    }
    expect(toolResult.isError).not.toBe(true);
    const text = (toolResult.content as Array<{ type: string; text?: string }>)[0]?.text ?? "{}";
    const deployed = JSON.parse(text) as { deployment: { id: string; status: string } };
    expect(deployed.deployment.status).toBe("ready");
    expect(orchestrator.getDeploymentOwner(deployed.deployment.id)).toBe("employee@example.com");
    const [sourceId] = await readdir(sources);
    expect(await readdir(path.join(sources, sourceId))).not.toContain(".env");
    expect(await readdir(path.join(sources, sourceId))).not.toContain("node_modules");
    expect(await readFile(path.join(project, "public", "build-env.txt"), "utf8")).toBe("isolated");
    expect(await readFile(path.join(sources, sourceId, "public", "build-env.txt"), "utf8")).toBe("isolated");
    expect(await readFile(path.join(sources, sourceId, ".zaodeploy", "prebuilt"), "utf8")).toMatch(/^[a-f0-9]{64}$/);

    const other = new RemoteDeploymentService({ baseUrl, token: "other-token" });
    await expect(other.getDeployment(deployed.deployment.id)).rejects.toThrow(/owner/i);
    await expect(other.getLogs(deployed.deployment.id)).rejects.toThrow(/owner/i);
    await expect(other.deleteDeployment(deployed.deployment.id)).rejects.toThrow(/owner/i);
    await expect(other.deploy({ projectDirectory: project, ownerId: "ignored" }))
      .rejects.toThrow(/already owned/i);
    expect(await readdir(sources)).toHaveLength(1);
    const deleted = await employee.deleteDeployment(deployed.deployment.id) as { deployment: { status: string } };
    expect(deleted.deployment.status).toBe("deleted");
    expect(await readdir(sources)).toEqual([]);
  });
});
