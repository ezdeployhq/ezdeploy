import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DeploymentOrchestrator } from "./orchestrator.js";
import { ControlPlaneRepository } from "./repository.js";
import { MockDeployProvider } from "./testing/mock-provider.js";

const manifest = `
apiVersion: ezdeploy.io/v1alpha1
kind: Application
metadata:
  name: expense-assistant
  displayName: Expense Assistant
spec:
  runtime: vite
  resources:
    - kind: database
      provider: cloudflare-d1
    - kind: storage
      provider: cloudflare-r2
    - kind: ai
      provider: zaodeploy-ai
  access:
    mode: organization
`;

describe("DeploymentOrchestrator", () => {
  let projectDirectory: string;
  let repository: ControlPlaneRepository;
  let provider: MockDeployProvider;
  let orchestrator: DeploymentOrchestrator;

  beforeEach(async () => {
    projectDirectory = await mkdtemp(path.join(os.tmpdir(), "zaodeploy-test-"));
    await writeFile(path.join(projectDirectory, "ezdeploy.yaml"), manifest, "utf8");
    repository = new ControlPlaneRepository(":memory:");
    provider = new MockDeployProvider();
    orchestrator = new DeploymentOrchestrator(repository, provider);
  });

  afterEach(async () => {
    repository.close();
    await rm(projectDirectory, { recursive: true, force: true });
  });

  it("completes the inspect-to-ready deployment loop", async () => {
    const result = await orchestrator.deploy({
      projectDirectory,
      ownerId: "employee@example.com",
    });

    expect(result.deployment.status).toBe("ready");
    expect(result.deployment.url).toBe(
      "https://expense-assistant-production.example.test",
    );
    expect(repository.listResourceBindings(
      result.deployment.applicationId,
      result.deployment.environmentId,
    )).toHaveLength(3);
    expect(repository.listEvents(result.deployment.id).map((event) => event.status)).toEqual([
      "queued",
      "inspecting",
      "planned",
      "provisioning",
      "deploying",
      "verifying",
      "ready",
    ]);
    expect(repository.listProviderLogs(result.deployment.id)).toHaveLength(2);
    expect((await orchestrator.getLogs(result.deployment.id)).provider[0]).toMatchObject({
      source: "mock-cloudflare",
      message: expect.stringContaining("build complete"),
    });
  });

  it("reuses resource bindings across repeated deployments", async () => {
    const first = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    const second = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });

    expect(second.deployment.sequence).toBe(first.deployment.sequence + 1);
    expect([...provider.provisionCounts.values()]).toEqual([1, 1, 1]);
    expect(repository.getActiveDeployment(second.deployment.environmentId)?.id).toBe(
      second.deployment.id,
    );
  });

  it("prevents another employee from deploying over an existing application slug", async () => {
    await orchestrator.deploy({ projectDirectory, ownerId: "owner-a" });
    await expect(orchestrator.deploy({ projectDirectory, ownerId: "owner-b" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("restores a previous healthy release as the active catalog entry", async () => {
    const first = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    await orchestrator.deploy({ projectDirectory, ownerId: "owner" });

    const restored = await orchestrator.rollbackDeployment(first.deployment.id);

    expect(restored.deployment.id).toBe(first.deployment.id);
    expect(repository.getActiveDeployment(first.deployment.environmentId)?.id).toBe(
      first.deployment.id,
    );
    expect(orchestrator.listApplications()[0]).toMatchObject({
      application: { slug: "expense-assistant" },
      deployment: { id: first.deployment.id },
      access: { mode: "organization" },
    });
  });

  it("refuses to delete an older release because the provider project is shared", async () => {
    const first = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    await expect(orchestrator.deleteDeployment(first.deployment.id)).rejects.toMatchObject({
      code: "DELETE_FAILED",
    });
  });

  it("persists a structured failure when verification fails", async () => {
    provider.failVerification = true;

    await expect(
      orchestrator.deploy({ projectDirectory, ownerId: "owner" }),
    ).rejects.toMatchObject({ code: "HEALTH_CHECK_FAILED" });

    const application = repository.getApplicationBySlug("expense-assistant");
    expect(application).not.toBeNull();
    const failed = orchestrator.listApplications()[0].recentDeployments[0];
    expect(repository.listEvents(failed.id).at(-1)).toMatchObject({
      status: "failed",
      details: { code: "HEALTH_CHECK_FAILED", statusCode: 503 },
    });
    expect(repository.listResourceBindings(failed.applicationId, failed.environmentId)).toEqual([]);
    expect(provider.deprovisioned.sort()).toEqual(["ai", "database", "storage"]);
    await orchestrator.getLogs(failed.id);
    expect(provider.runtimeLogsCount).toBe(0);
  });

  it("automatically restores the active healthy release when a new health check fails", async () => {
    const first = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    provider.verificationFailuresRemaining = 1;

    await expect(orchestrator.deploy({ projectDirectory, ownerId: "owner" }))
      .rejects.toMatchObject({ code: "HEALTH_CHECK_FAILED" });

    expect(repository.getActiveDeployment(first.deployment.environmentId)?.id).toBe(
      first.deployment.id,
    );
    expect(repository.getActiveDeployment(first.deployment.environmentId)?.status).toBe("ready");
  });

  it("deletes a release and explicitly removes bindings when requested", async () => {
    const result = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });

    const deleted = await orchestrator.deleteDeployment(result.deployment.id, true);

    expect(deleted).toMatchObject({
      resourcesRemoved: true,
      deployment: { status: "deleted" },
    });
    expect(
      repository.listResourceBindings(
        result.deployment.applicationId,
        result.deployment.environmentId,
      ),
    ).toEqual([]);
    expect(repository.getActiveDeployment(result.deployment.environmentId)).toBeNull();
    expect(orchestrator.listApplications()).toEqual([]);
    expect(repository.listEvents(result.deployment.id).at(-1)?.message).toContain(
      "bound resources deleted",
    );
  });

  it("deleting an application archives every release instead of leaving ready ghosts", async () => {
    const first = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    const second = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });

    await orchestrator.deleteDeployment(second.deployment.id, true);

    expect(repository.listAllDeployments(second.deployment.environmentId).map(({ status }) => status))
      .toEqual(["deleted", "deleted"]);
    expect(repository.getDeployment(first.deployment.id).status).toBe("deleted");
    expect(orchestrator.listApplications()).toEqual([]);
    expect(provider.destroyCount).toBe(1);
  });

  it("persists partial resource cleanup and allows a failed deletion to resume", async () => {
    const result = await orchestrator.deploy({ projectDirectory, ownerId: "owner" });
    provider.failDeprovisionKind = "database";

    await expect(orchestrator.deleteDeployment(result.deployment.id, true)).rejects.toMatchObject({
      code: "DELETE_FAILED",
    });
    expect(repository.getActiveDeployment(result.deployment.environmentId)).toBeNull();
    expect(repository.listResourceBindings(
      result.deployment.applicationId,
      result.deployment.environmentId,
    ).map((binding) => binding.kind)).toEqual(["database", "storage"]);

    provider.failDeprovisionKind = undefined;
    const resumed = await orchestrator.deleteDeployment(result.deployment.id, true);
    expect(resumed.deployment.status).toBe("deleted");
    expect(repository.listResourceBindings(
      result.deployment.applicationId,
      result.deployment.environmentId,
    )).toEqual([]);
    expect(provider.destroyCount).toBe(1);
  });
});
