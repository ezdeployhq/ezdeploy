import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  ControlPlaneRepository,
  DeploymentOrchestrator,
  MockDeployProvider,
} from "@ezdeploy/core";
import { createProviderFromEnvironment, createServer } from "./server.js";

const manifest = `
apiVersion: ezdeploy.io/v1alpha1
kind: Application
metadata:
  name: mcp-example
spec:
  runtime: vite
  resources:
    - kind: ai
  access:
    mode: organization
`;

describe("EZdeploy MCP server", () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()?.();
  });

  it("exposes a deploy tool that returns a verified URL", async () => {
    const projectDirectory = await mkdtemp(path.join(os.tmpdir(), "zaodeploy-mcp-"));
    await writeFile(path.join(projectDirectory, "ezdeploy.yaml"), manifest, "utf8");
    const repository = new ControlPlaneRepository(":memory:");
    const server = createServer(
      new DeploymentOrchestrator(repository, new MockDeployProvider()),
    );
    const client = new Client({ name: "zaodeploy-test", version: "0.1.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    cleanups.push(() => rm(projectDirectory, { recursive: true, force: true }));
    cleanups.push(() => repository.close());
    cleanups.push(() => server.close());
    cleanups.push(() => client.close());

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    expect(client.getInstructions()).toContain("ensure ezdeploy.yaml exists");
    expect(client.getInstructions()).toContain("status ready");
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "inspect_zaodeploy_project",
        "plan_zaodeploy_deployment",
        "deploy_to_zaodeploy",
        "get_zaodeploy_deployment",
        "get_zaodeploy_logs",
        "delete_zaodeploy_app",
      ]),
    );

    const response = await client.callTool({
      name: "deploy_to_zaodeploy",
      arguments: { projectDirectory, ownerId: "employee@example.com" },
    });
    expect(response.isError).not.toBe(true);
    const content = response.content as Array<{ type: string; text?: string }>;
    const block = content[0];
    expect(block?.type).toBe("text");
    if (block?.type !== "text" || !block.text) throw new Error("Expected text tool response");
    const result = JSON.parse(block.text) as {
      deployment: { status: string; url: string };
    };
    expect(result.deployment).toMatchObject({
      status: "ready",
      url: "https://mcp-example-production.example.test",
    });
  });

  it("requires an explicit provider and never silently returns mock URLs", () => {
    expect(() => createProviderFromEnvironment({})).toThrowError(
      /Set ZAODEPLOY_PROVIDER=cloudflare/,
    );
    expect(createProviderFromEnvironment({ ZAODEPLOY_PROVIDER: "mock" })).toBeInstanceOf(
      MockDeployProvider,
    );
  });
});
