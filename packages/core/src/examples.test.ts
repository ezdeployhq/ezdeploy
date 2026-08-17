import path from "node:path";
import { describe, expect, it } from "vitest";
import { DeploymentOrchestrator } from "./orchestrator.js";
import { ControlPlaneRepository } from "./repository.js";
import { MockDeployProvider } from "./testing/mock-provider.js";

const examples = [
  ["static-site", 0],
  ["vite-internal-app", 3],
  ["cloudflare-worker", 2],
] as const;

describe("supported example applications", () => {
  for (const [directory, resourceCount] of examples) {
    it(`takes ${directory} through the MCP-equivalent ready loop`, async () => {
      const repository = new ControlPlaneRepository(":memory:");
      try {
        const orchestrator = new DeploymentOrchestrator(repository, new MockDeployProvider());
        const result = await orchestrator.deploy({
          projectDirectory: path.resolve("examples", directory),
          ownerId: "employee@example.com",
        });
        expect(result.deployment).toMatchObject({ status: "ready" });
        expect(repository.listResourceBindings(
          result.deployment.applicationId,
          result.deployment.environmentId,
        )).toHaveLength(resourceCount);
      } finally {
        repository.close();
      }
    });
  }
});
