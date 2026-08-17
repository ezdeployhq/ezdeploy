import { randomUUID } from "node:crypto";
import type { ResourceBinding, EZdeployManifest } from "@ezdeploy/contracts";
import type {
  DeployContext,
  DeployProvider,
  DeploymentPlan,
  ProviderDeployment,
  ProvisionContext,
  VerificationResult,
} from "../provider.js";

export class MockDeployProvider implements DeployProvider {
  readonly name = "mock-cloudflare";
  readonly provisionCounts = new Map<string, number>();
  failVerification = false;
  verificationFailuresRemaining = 0;
  failDeprovisionKind?: ResourceBinding["kind"];
  readonly deprovisioned: ResourceBinding["kind"][] = [];
  destroyCount = 0;
  runtimeLogsCount = 0;

  supports(manifest: EZdeployManifest): boolean {
    return ["static", "vite", "cloudflare-workers"].includes(
      manifest.spec.runtime,
    );
  }

  plan(manifest: EZdeployManifest): DeploymentPlan {
    return {
      provider: this.name,
      runtime: manifest.spec.runtime,
      buildCommand: manifest.spec.buildCommand,
      outputDirectory: manifest.spec.outputDirectory,
      resources: manifest.spec.resources.map((request) => ({
        kind: request.kind,
        provider: request.provider ?? `mock-${request.kind}`,
        plan: request.plan,
      })),
      accessMode: manifest.spec.access.mode,
    };
  }

  async provision(
    context: ProvisionContext,
    request: EZdeployManifest["spec"]["resources"][number],
  ): Promise<Omit<ResourceBinding, "id" | "createdAt">> {
    const key = `${context.applicationId}:${context.environmentId}:${request.kind}`;
    this.provisionCounts.set(key, (this.provisionCounts.get(key) ?? 0) + 1);
    return {
      applicationId: context.applicationId,
      environmentId: context.environmentId,
      kind: request.kind,
      provider: request.provider ?? `mock-${request.kind}`,
      externalId: `${context.applicationSlug}-${context.environmentName}-${request.kind}`,
      secretReference: `secret://${context.applicationSlug}/${context.environmentName}/${request.kind}`,
      configuration: {},
    };
  }

  async deprovision(binding: ResourceBinding): Promise<void> {
    if (binding.kind === this.failDeprovisionKind) throw new Error("Mock deprovision failed");
    this.deprovisioned.push(binding.kind);
  }

  async prepare(_context: DeployContext): Promise<void> {}

  async deploy(context: DeployContext): Promise<ProviderDeployment> {
    return {
      providerDeploymentId: `mock_${randomUUID()}`,
      url: `https://${context.applicationSlug}-${context.environmentName}.example.test`,
    };
  }

  async verify(
    _context: DeployContext,
    _result: ProviderDeployment,
  ): Promise<VerificationResult> {
    const fail = this.failVerification || this.verificationFailuresRemaining > 0;
    if (this.verificationFailuresRemaining > 0) this.verificationFailuresRemaining -= 1;
    return fail
      ? { healthy: false, statusCode: 503, message: "Mock health check failed" }
      : { healthy: true, statusCode: 200 };
  }

  async destroy(_context: DeployContext, _result: ProviderDeployment): Promise<void> {
    this.destroyCount += 1;
  }

  async rollback(_context: DeployContext, result: ProviderDeployment): Promise<ProviderDeployment> {
    return result;
  }

  async logs(providerDeploymentId: string): Promise<string[]> {
    return [`${providerDeploymentId}: build complete`, `${providerDeploymentId}: ready`];
  }

  async runtimeLogs(_providerDeploymentId: string): Promise<string[]> {
    this.runtimeLogsCount += 1;
    return [];
  }
}
