import { createHash } from "node:crypto";
import path from "node:path";
import type { Deployment, ResourceBinding, EZdeployManifest } from "@ezdeploy/contracts";
import { loadManifest, zaoDeployManifestSchema, EZdeployError } from "@ezdeploy/contracts";
import type { DeployProvider, DeploymentPlan, ProviderDeployment } from "./provider.js";
import { ControlPlaneRepository } from "./repository.js";

function manifestDigest(manifest: EZdeployManifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export interface DeployApplicationInput {
  projectDirectory: string;
  ownerId: string;
  environment?: string;
}

export interface DeployApplicationResult {
  deployment: Deployment;
  plan: DeploymentPlan;
}

export class DeploymentOrchestrator {
  constructor(
    private readonly repository: ControlPlaneRepository,
    private readonly provider: DeployProvider,
  ) {}

  async inspect(projectDirectory: string): Promise<EZdeployManifest> {
    try {
      return await loadManifest(path.resolve(projectDirectory));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new EZdeployError(
          "MANIFEST_NOT_FOUND",
          `No ezdeploy.yaml found in ${projectDirectory}`,
        );
      }
      if (error instanceof EZdeployError) throw error;
      throw new EZdeployError("MANIFEST_INVALID", "ezdeploy.yaml is invalid", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async plan(projectDirectory: string): Promise<DeploymentPlan> {
    const manifest = await this.inspect(projectDirectory);
    return this.planManifest(manifest);
  }

  planManifest(manifest: EZdeployManifest): DeploymentPlan {
    if (!this.provider.supports(manifest)) {
      throw new EZdeployError(
        "RUNTIME_UNSUPPORTED",
        `${this.provider.name} does not support runtime ${manifest.spec.runtime}`,
      );
    }
    return this.provider.plan(manifest);
  }

  async deploy(input: DeployApplicationInput): Promise<DeployApplicationResult> {
    const projectDirectory = path.resolve(input.projectDirectory);
    const manifest = await this.inspect(projectDirectory);
    const plan = await this.plan(projectDirectory);
    const application = this.repository.upsertApplication(
      manifest.metadata.name,
      manifest.metadata.displayName ?? manifest.metadata.name,
      input.ownerId,
    );
    const environment = this.repository.upsertEnvironment(
      application.id,
      input.environment ?? "production",
      this.provider.name,
    );
    const activeBefore = this.repository.getActiveDeployment(environment.id);
    let deployment = this.repository.createDeployment({
      applicationId: application.id,
      environmentId: environment.id,
      runtime: manifest.spec.runtime,
      sourceDirectory: projectDirectory,
      manifestDigest: manifestDigest(manifest),
      manifestJson: JSON.stringify(manifest),
    });

    let providerResult: ProviderDeployment | undefined;
    let deployContext: Parameters<DeployProvider["deploy"]>[0] | undefined;
    const newlyProvisioned: ResourceBinding[] = [];
    try {
      deployment = this.repository.updateDeploymentStatus(
        deployment.id,
        "inspecting",
        "Project manifest inspected",
      );
      deployment = this.repository.updateDeploymentStatus(
        deployment.id,
        "planned",
        "Deployment plan generated",
      );
      deployment = this.repository.updateDeploymentStatus(
        deployment.id,
        "provisioning",
        "Provisioning resource bindings",
      );

      for (const request of manifest.spec.resources) {
        const existing = this.repository
          .listResourceBindings(application.id, environment.id)
          .find((binding) => binding.kind === request.kind);
        if (!existing) {
          const provisioned = await this.provider.provision(
            {
              applicationId: application.id,
              environmentId: environment.id,
              applicationSlug: application.slug,
              environmentName: environment.name,
            },
            request,
          );
          newlyProvisioned.push(this.repository.upsertResourceBinding(provisioned));
        }
      }

      this.repository.upsertAccessPolicy({
        applicationId: application.id,
        environmentId: environment.id,
        mode: manifest.spec.access.mode,
        allowedGroups: manifest.spec.access.allowedGroups,
      });

      const bindings = this.repository.listResourceBindings(application.id, environment.id);
      const baseContext = {
        applicationId: application.id,
        environmentId: environment.id,
        applicationSlug: application.slug,
        environmentName: environment.name,
        deployment,
        projectDirectory,
        manifest,
        bindings,
      };
      await this.provider.prepare(baseContext);
      deployment = this.repository.updateDeploymentStatus(
        deployment.id,
        "deploying",
        "Application deployment started",
      );
      const context = { ...baseContext, deployment };
      deployContext = context;
      providerResult = await this.provider.deploy(context);
      this.repository.appendProviderLogs(
        deployment.id,
        this.provider.name,
        await this.provider.logs(providerResult.providerDeploymentId),
      );
      deployment = this.repository.updateDeploymentStatus(
        deployment.id,
        "verifying",
        "Deployment created; checking application health",
        {
          providerDeploymentId: providerResult.providerDeploymentId,
          url: providerResult.url,
        },
      );
      const verification = await this.provider.verify(context, providerResult);
      if (!verification.healthy) {
        throw new EZdeployError(
          "HEALTH_CHECK_FAILED",
          verification.message ?? "Application health check failed",
          { statusCode: verification.statusCode },
        );
      }
      deployment = this.repository.updateDeploymentStatus(
        deployment.id,
        "ready",
        "Application is healthy and ready",
      );
      this.repository.setActiveDeployment(environment.id, deployment.id);
      return { deployment, plan };
    } catch (error) {
      const structured =
        error instanceof EZdeployError
          ? error
          : new EZdeployError("DEPLOY_FAILED", "Application deployment failed", {
              cause: error instanceof Error ? error.message : String(error),
            });
      const recoveryErrors: string[] = [];
      if (providerResult && deployContext) {
        try {
          if (activeBefore?.providerDeploymentId && activeBefore.url) {
            const previousManifest = zaoDeployManifestSchema.parse(
              JSON.parse(this.repository.getDeploymentManifest(activeBefore.id)),
            );
            const previousContext = {
              ...deployContext,
              deployment: activeBefore,
              projectDirectory: activeBefore.sourceDirectory,
              manifest: previousManifest,
            };
            const restored = await this.provider.rollback(previousContext, {
              providerDeploymentId: activeBefore.providerDeploymentId,
              url: activeBefore.url,
            });
            const restoredHealth = await this.provider.verify(previousContext, restored);
            if (!restoredHealth.healthy) throw new Error(restoredHealth.message ?? "Restore health failed");
            this.repository.updateDeploymentEndpoint(
              activeBefore.id,
              restored.providerDeploymentId,
              restored.url,
            );
          } else {
            await this.provider.destroy(deployContext, providerResult);
            this.repository.markProviderDestroyed(deployment.id);
          }
        } catch (recovery) {
          recoveryErrors.push(recovery instanceof Error ? recovery.message : String(recovery));
        }
      }
      for (const binding of newlyProvisioned.reverse()) {
        try {
          await this.provider.deprovision(binding);
          this.repository.deleteResourceBinding(binding.id);
        } catch (recovery) {
          recoveryErrors.push(
            `Failed to compensate ${binding.kind}: ${recovery instanceof Error ? recovery.message : String(recovery)}`,
          );
        }
      }
      const current = this.repository.getDeployment(deployment.id);
      if (current.status !== "failed") {
        deployment = this.repository.updateDeploymentStatus(
          deployment.id,
          "failed",
          structured.message,
          { errorCode: structured.code, errorMessage: structured.message },
          {
            code: structured.code,
            ...structured.details,
            ...(recoveryErrors.length ? { recoveryError: recoveryErrors.join("; ") } : {}),
          },
        );
      }
      throw structured;
    }
  }

  getDeployment(id: string): Deployment {
    return this.repository.getDeployment(id);
  }

  getDeploymentOwner(id: string): string {
    const deployment = this.repository.getDeployment(id);
    return this.repository.getApplication(deployment.applicationId).ownerId;
  }

  getEnvironmentSourceDirectories(id: string): string[] {
    const deployment = this.repository.getDeployment(id);
    return [...new Set(
      this.repository.listAllDeployments(deployment.environmentId)
        .map((candidate) => candidate.sourceDirectory),
    )];
  }

  listApplications(): ReturnType<ControlPlaneRepository["listCatalog"]> {
    return this.repository.listCatalog();
  }

  async rollbackDeployment(id: string): Promise<{ deployment: Deployment; url: string }> {
    const deployment = this.repository.getDeployment(id);
    if (deployment.status !== "ready" || !deployment.providerDeploymentId || !deployment.url) {
      throw new EZdeployError(
        "INVALID_STATE_TRANSITION",
        "Only a healthy ready deployment can be restored",
      );
    }
    const application = this.repository.getApplication(deployment.applicationId);
    const environment = this.repository.getEnvironment(deployment.environmentId);
    const manifest = zaoDeployManifestSchema.parse(
      JSON.parse(this.repository.getDeploymentManifest(id)),
    );
    const context = {
      applicationId: application.id,
      environmentId: environment.id,
      applicationSlug: application.slug,
      environmentName: environment.name,
      deployment,
      projectDirectory: deployment.sourceDirectory,
      manifest,
      bindings: this.repository.listResourceBindings(application.id, environment.id),
    };
    const restored = await this.provider.rollback(context, {
      providerDeploymentId: deployment.providerDeploymentId,
      url: deployment.url,
    });
    const verification = await this.provider.verify(context, restored);
    if (!verification.healthy) {
      throw new EZdeployError(
        "HEALTH_CHECK_FAILED",
        verification.message ?? "Restored application health check failed",
        { statusCode: verification.statusCode },
      );
    }
    const updated = this.repository.updateDeploymentEndpoint(
      deployment.id,
      restored.providerDeploymentId,
      restored.url,
    );
    this.repository.setActiveDeployment(environment.id, deployment.id);
    return { deployment: updated, url: restored.url };
  }

  async getLogs(id: string): Promise<{
    events: ReturnType<ControlPlaneRepository["listEvents"]>;
    provider: ReturnType<ControlPlaneRepository["listProviderLogs"]>;
    liveProvider: string[];
    runtime: string[];
  }> {
    const deployment = this.repository.getDeployment(id);
    const liveProvider = deployment.providerDeploymentId
      ? await this.provider.logs(deployment.providerDeploymentId)
      : [];
    const runtime = deployment.status === "ready" && deployment.providerDeploymentId
      ? await this.provider.runtimeLogs(deployment.providerDeploymentId)
      : [];
    if (runtime.length) {
      this.repository.appendProviderLogs(id, `${this.provider.name}:runtime`, runtime);
    }
    return {
      events: this.repository.listEvents(id),
      provider: this.repository.listProviderLogs(id),
      liveProvider,
      runtime,
    };
  }

  async deleteDeployment(
    id: string,
    removeResources = false,
  ): Promise<{ deployment: Deployment; resourcesRemoved: boolean }> {
    let deployment = this.repository.getDeployment(id);
    const application = this.repository.getApplication(deployment.applicationId);
    const environment = this.repository.getEnvironment(deployment.environmentId);
    const active = this.repository.getActiveDeployment(environment.id);
    if (active && active.id !== id) {
      throw new EZdeployError(
        "DELETE_FAILED",
        "Only the active deployment can delete the provider application; restore it first or delete the active release",
      );
    }
    const manifest = zaoDeployManifestSchema.parse(
      JSON.parse(this.repository.getDeploymentManifest(id)),
    );
    const bindings = this.repository.listResourceBindings(application.id, environment.id);
    const environmentDeployments = this.repository.listAllDeployments(environment.id);
    const inProgress = environmentDeployments.find((candidate) =>
      !["ready", "failed", "deleted"].includes(candidate.status) && candidate.id !== id,
    );
    if (inProgress) {
      throw new EZdeployError(
        "DELETE_FAILED",
        `Cannot delete the application while deployment ${inProgress.id} is ${inProgress.status}`,
      );
    }
    const context = {
      applicationId: application.id,
      environmentId: environment.id,
      applicationSlug: application.slug,
      environmentName: environment.name,
      deployment,
      projectDirectory: deployment.sourceDirectory,
      manifest,
      bindings,
    };

    try {
      deployment = this.repository.updateDeploymentStatus(
        id,
        "deleting",
        removeResources
          ? "Deleting application deployment and bound resources"
          : "Deleting application deployment; retaining bound resources",
      );
      if (
        deployment.providerDeploymentId &&
        deployment.url &&
        !this.repository.isProviderDestroyed(id)
      ) {
        await this.provider.destroy(context, {
          providerDeploymentId: deployment.providerDeploymentId,
          url: deployment.url,
        });
        this.repository.markProviderDestroyed(id);
      }
      if (removeResources) {
        for (const binding of bindings) {
          await this.provider.deprovision(binding);
          this.repository.deleteResourceBinding(binding.id);
        }
      }
      for (const candidate of environmentDeployments) {
        let current = this.repository.getDeployment(candidate.id);
        if (current.status === "deleted") continue;
        if (current.status !== "deleting") {
          current = this.repository.updateDeploymentStatus(
            current.id,
            "deleting",
            "Archiving release as part of application deletion",
          );
        }
        const deleted = this.repository.updateDeploymentStatus(
          current.id,
          "deleted",
          removeResources
            ? "Application and bound resources deleted"
            : "Application deleted; bound resources retained for a future redeploy",
        );
        if (current.id === id) deployment = deleted;
      }
      this.repository.archiveEnvironment(environment.id);
      return { deployment, resourcesRemoved: removeResources };
    } catch (error) {
      const structured = new EZdeployError("DELETE_FAILED", "Application deletion failed", {
        cause: error instanceof Error ? error.message : String(error),
      });
      const current = this.repository.getDeployment(id);
      if (current.status === "deleting") {
        this.repository.updateDeploymentStatus(id, "failed", structured.message, {
          errorCode: structured.code,
          errorMessage: structured.message,
        }, { code: structured.code, ...structured.details });
      }
      if (this.repository.getActiveDeployment(environment.id)?.id === id) {
        this.repository.setActiveDeployment(environment.id, null);
      }
      throw structured;
    }
  }
}
