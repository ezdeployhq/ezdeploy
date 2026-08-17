import type {
  Deployment,
  ResourceBinding,
  ResourceKind,
  EZdeployManifest,
} from "@ezdeploy/contracts";

export interface DeploymentPlan {
  provider: string;
  runtime: EZdeployManifest["spec"]["runtime"];
  buildCommand?: string;
  outputDirectory?: string;
  resources: Array<{
    kind: ResourceKind;
    provider: string;
    plan: string;
  }>;
  accessMode: "public" | "organization";
}

export interface ProvisionContext {
  applicationId: string;
  environmentId: string;
  applicationSlug: string;
  environmentName: string;
}

export interface DeployContext extends ProvisionContext {
  deployment: Deployment;
  projectDirectory: string;
  manifest: EZdeployManifest;
  bindings: ResourceBinding[];
}

export interface ProviderDeployment {
  providerDeploymentId: string;
  url: string;
}

export interface VerificationResult {
  healthy: boolean;
  statusCode?: number;
  message?: string;
}

export interface DeployProvider {
  readonly name: string;
  supports(manifest: EZdeployManifest): boolean;
  plan(manifest: EZdeployManifest): DeploymentPlan;
  provision(
    context: ProvisionContext,
    request: EZdeployManifest["spec"]["resources"][number],
  ): Promise<Omit<ResourceBinding, "id" | "createdAt">>;
  deprovision(binding: ResourceBinding): Promise<void>;
  prepare(context: DeployContext): Promise<void>;
  deploy(context: DeployContext): Promise<ProviderDeployment>;
  verify(context: DeployContext, result: ProviderDeployment): Promise<VerificationResult>;
  rollback(context: DeployContext, result: ProviderDeployment): Promise<ProviderDeployment>;
  destroy(context: DeployContext, result: ProviderDeployment): Promise<void>;
  logs(providerDeploymentId: string): Promise<string[]>;
  runtimeLogs(providerDeploymentId: string): Promise<string[]>;
}
