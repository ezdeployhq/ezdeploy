import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { activate, deploymentContext, resources, saveResource, setStatus } from "./db.js";
import { applyAccess, applyMigrations, deployPages, pagesCustomDomainStatus, provisionResource, verifyApplication } from "./cloudflare.js";
import type { CloudResource, DeploymentBundle, Environment } from "./types.js";

export class DeploymentWorkflow extends WorkflowEntrypoint<Environment, { deploymentId: string }> {
  async run(event: WorkflowEvent<{ deploymentId: string }>, step: WorkflowStep) {
    const id = event.payload.deploymentId;
    try {
      const context = await step.do("load-deployment", async () => deploymentContext(this.env, id));
      const artifact = await step.do("load-artifact-reference", async () => {
        const object = await this.env.SOURCES.head(String(context.artifact_key));
        if (!object) throw new Error("Deployment artifact no longer exists");
        return { key: String(context.artifact_key), size: object.size };
      });
      // Workflow step outputs are capped at 1 MiB. The bundle can be up to 25 MiB, so
      // keep it in R2 and read it into invocation memory instead of persisting it as
      // a step result.
      const object = await this.env.SOURCES.get(artifact.key);
      if (!object) throw new Error("Deployment artifact no longer exists");
      const bundle = await object.json<DeploymentBundle>();
      await step.do("inspect", async () => setStatus(this.env, id, "inspecting", "Cloud bundle validated"));
      const existing = await step.do("load-resources", async () => resources(this.env, String(context.application_id), String(context.environment_id)));
      const provisioned: CloudResource[] = [...existing];
      let issuedAiSecret: string | undefined;
      for (const request of bundle.manifest.spec.resources) {
        if (provisioned.some((item) => item.kind === request.kind)) continue;
        const result = await step.do(`provision-${request.kind}`, { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } }, async () => {
          await setStatus(this.env, id, "provisioning", `Provisioning ${request.kind}`);
          return provisionResource(this.env, request.kind, String(context.slug), String(context.environment_name), String(context.application_id));
        });
        const saved = await step.do(`save-${request.kind}`, async () => saveResource(
          this.env, String(context.application_id), String(context.environment_id), request.kind,
          result.externalId, result.configuration,
        ));
        provisioned.push(saved);
        if (request.kind === "ai") issuedAiSecret = result.secret;
      }
      const database = provisioned.find((item) => item.kind === "database");
      if (database && bundle.migrations.length) {
        await step.do("apply-database-migrations", { retries: { limit: 2, delay: "2 seconds" } }, async () => applyMigrations(this.env, database, bundle.migrations));
      }
      const projectName = `zao-${String(context.slug)}-${String(context.environment_name)}`.replace(/[^a-z0-9-]/g, "-").slice(0, 63);
      const deployed = await step.do("deploy-pages", { retries: { limit: 3, delay: "3 seconds", backoff: "exponential" } }, async () => {
        await setStatus(this.env, id, "deploying", "Publishing prebuilt bundle to Cloudflare Pages");
        return deployPages(this.env, projectName, String(context.environment_name), bundle, provisioned, issuedAiSecret);
      });
      if (deployed.customHostname) {
        let domainActive = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          const status = await step.do(`check-custom-domain-${attempt}`, async () =>
            pagesCustomDomainStatus(this.env, deployed.projectPath, deployed.customHostname!));
          if (status === "active") {
            domainActive = true;
            break;
          }
          await step.sleep(`wait-custom-domain-${attempt}`, "10 seconds");
        }
        if (!domainActive) {
          throw new Error(`Custom domain ${deployed.customHostname} did not become active within four minutes`);
        }
      }
      await step.do("apply-access", { retries: { limit: 3, delay: "3 seconds" } }, async () => {
        await applyAccess(
          this.env,
          bundle.manifest,
          String(context.environment_name),
          deployed.stableUrl,
          String(context.owner_id),
        );
      });
      await step.do("verify", { retries: { limit: 1, delay: "2 seconds" } }, async () => {
        await setStatus(this.env, id, "verifying", "Running authenticated health check", { providerId: deployed.id, url: deployed.stableUrl });
        await verifyApplication(this.env, deployed.stableUrl, bundle.manifest);
      });
      await step.do("activate", async () => {
        await activate(this.env, String(context.environment_id), id);
        await setStatus(this.env, id, "ready", "Application is live", { providerId: deployed.id, url: deployed.stableUrl });
      });
      return { deploymentId: id, url: deployed.stableUrl, status: "ready" };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorCode = message.startsWith("Health check failed")
        ? "HEALTH_CHECK_FAILED"
        : "DEPLOY_FAILED";
      await setStatus(this.env, id, "failed", "Deployment failed", { errorCode, errorMessage: message });
      throw error;
    }
  }
}
