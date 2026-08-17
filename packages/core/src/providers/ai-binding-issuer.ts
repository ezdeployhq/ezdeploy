import type { ResourceBinding } from "@ezdeploy/contracts";
import { EZdeployError } from "@ezdeploy/contracts";
import type { ProvisionContext } from "../provider.js";
import type { SecretStore } from "../secrets.js";
import type { AiBindingIssuer } from "./cloudflare.provider.js";

export interface HttpAiBindingIssuerOptions {
  baseUrl: string;
  controlPlaneToken: string;
  secretStore: SecretStore;
  allowedModels?: string[];
  requestsPerMinute?: number;
  fetch?: typeof globalThis.fetch;
}

export class HttpAiBindingIssuer implements AiBindingIssuer {
  private readonly fetcher: typeof globalThis.fetch;

  constructor(private readonly options: HttpAiBindingIssuerOptions) {
    if (!options.baseUrl || !options.controlPlaneToken) {
      throw new EZdeployError(
        "PROVIDER_NOT_CONFIGURED",
        "AI Proxy URL and control-plane token are required",
      );
    }
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async issue(context: ProvisionContext) {
    const response = await this.fetcher(
      `${this.options.baseUrl.replace(/\/$/, "")}/admin/v1/credentials`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.controlPlaneToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          appId: context.applicationId,
          allowedModels: this.options.allowedModels ?? ["default-chat"],
          requestsPerMinute: this.options.requestsPerMinute ?? 60,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`AI Proxy credential creation failed with HTTP ${response.status}`);
    }
    const result = (await response.json()) as { credentialId?: string; virtualKey?: string };
    if (!result.credentialId || !result.virtualKey?.startsWith("zai_")) {
      throw new Error("AI Proxy returned an invalid credential");
    }
    const secretReference = await this.options.secretStore.put(result.virtualKey);
    return {
      externalId: result.credentialId,
      secretReference,
      baseUrl: `${this.options.baseUrl.replace(/\/$/, "")}/v1`,
    };
  }

  async revoke(binding: ResourceBinding): Promise<void> {
    const response = await this.fetcher(
      `${this.options.baseUrl.replace(/\/$/, "")}/admin/v1/credentials/${encodeURIComponent(binding.externalId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${this.options.controlPlaneToken}` },
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`AI Proxy credential revocation failed with HTTP ${response.status}`);
    }
    await this.options.secretStore.delete(binding.secretReference);
  }
}
