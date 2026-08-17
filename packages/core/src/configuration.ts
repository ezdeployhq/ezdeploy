import path from "node:path";
import { EZdeployError } from "@ezdeploy/contracts";
import type { DeployProvider } from "./provider.js";
import { HttpAiBindingIssuer } from "./providers/ai-binding-issuer.js";
import { CloudflareAccessController } from "./providers/cloudflare-access.js";
import { CloudflareDeployProvider } from "./providers/cloudflare.provider.js";
import { EncryptedFileSecretStore } from "./secrets.js";
import { MockDeployProvider } from "./testing/mock-provider.js";

export function createProviderFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DeployProvider {
  const provider = environment.ZAODEPLOY_PROVIDER;
  if (provider === "mock") return new MockDeployProvider();
  if (provider === "cloudflare") {
    const encryptionKey = environment.ZAODEPLOY_ENCRYPTION_KEY;
    const secretStore = encryptionKey
      ? new EncryptedFileSecretStore(
          path.resolve(environment.ZAODEPLOY_SECRETS_PATH ?? ".zaodeploy/secrets"),
          encryptionKey,
        )
      : undefined;
    const aiIssuer =
      environment.ZAODEPLOY_AI_PROXY_URL &&
      environment.ZAODEPLOY_AI_CONTROL_TOKEN &&
      secretStore
        ? new HttpAiBindingIssuer({
            baseUrl: environment.ZAODEPLOY_AI_PROXY_URL,
            controlPlaneToken: environment.ZAODEPLOY_AI_CONTROL_TOKEN,
            secretStore,
            allowedModels: (environment.ZAODEPLOY_AI_MODELS ?? "default-chat")
              .split(",")
              .map((model) => model.trim())
              .filter(Boolean),
            requestsPerMinute: Number(environment.ZAODEPLOY_AI_RPM ?? 60),
          })
        : undefined;
    const accessController = environment.CLOUDFLARE_ACCESS_ENABLED === "true"
      ? new CloudflareAccessController({
          accountId: environment.CLOUDFLARE_ACCOUNT_ID ?? "",
          apiToken: environment.CLOUDFLARE_API_TOKEN ?? "",
          organizationEmailDomain: environment.CLOUDFLARE_ACCESS_EMAIL_DOMAIN,
          serviceTokenIds: (environment.CLOUDFLARE_ACCESS_SERVICE_TOKEN_IDS ?? "")
            .split(",").map((value) => value.trim()).filter(Boolean),
        })
      : undefined;
    return new CloudflareDeployProvider({
      accountId: environment.CLOUDFLARE_ACCOUNT_ID ?? "",
      apiToken: environment.CLOUDFLARE_API_TOKEN ?? "",
      secretStore,
      aiIssuer,
      accessController,
      accessServiceToken:
        environment.CLOUDFLARE_ACCESS_SERVICE_CLIENT_ID &&
        environment.CLOUDFLARE_ACCESS_SERVICE_CLIENT_SECRET
          ? {
              clientId: environment.CLOUDFLARE_ACCESS_SERVICE_CLIENT_ID,
              clientSecret: environment.CLOUDFLARE_ACCESS_SERVICE_CLIENT_SECRET,
            }
          : undefined,
    });
  }
  throw new EZdeployError(
    "PROVIDER_NOT_CONFIGURED",
    "Set ZAODEPLOY_PROVIDER=cloudflare for real deployments or ZAODEPLOY_PROVIDER=mock for local tests",
  );
}
