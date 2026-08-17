import { EZdeployError } from "@ezdeploy/contracts";
import type { AccessPolicyController } from "./cloudflare.provider.js";

interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors?: Array<{ message?: string }>;
}

interface AccessApplication {
  id: string;
  name: string;
}

export interface CloudflareAccessControllerOptions {
  accountId: string;
  apiToken: string;
  organizationEmailDomain?: string;
  serviceTokenIds?: string[];
  fetch?: typeof globalThis.fetch;
}

export class CloudflareAccessController implements AccessPolicyController {
  private readonly fetcher: typeof globalThis.fetch;

  constructor(private readonly options: CloudflareAccessControllerOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async apply(input: {
    applicationSlug: string;
    environmentName: string;
    url: string;
    mode: "public" | "organization";
    allowedGroups: string[];
  }): Promise<void> {
    const name = this.name(input.applicationSlug, input.environmentName);
    const existing = await this.find(name);
    if (input.mode === "public") {
      if (existing) await this.request(`/access/apps/${existing.id}`, { method: "DELETE" });
      return;
    }
    if (input.allowedGroups.length === 0 && !this.options.organizationEmailDomain) {
      throw new EZdeployError(
        "PROVIDER_NOT_CONFIGURED",
        "Organization access requires allowedGroups or CLOUDFLARE_ACCESS_EMAIL_DOMAIN",
      );
    }
    const hostname = new URL(input.url).hostname;
    const destinations = pagesDestinations(hostname);
    const include = input.allowedGroups.length
      ? input.allowedGroups.map((id) => ({ group: { id } }))
      : [{ email_domain: { domain: this.options.organizationEmailDomain } }];
    const body = {
      name,
      type: "self_hosted",
      domain: destinations[0],
      destinations: destinations.map((uri) => ({ type: "public", uri })),
      app_launcher_visible: true,
      session_duration: "8h",
      policies: [
        { name: `${name}-allow`, decision: "allow", include },
        ...(this.options.serviceTokenIds ?? []).length
          ? [{
              name: `${name}-service`,
              decision: "non_identity",
              include: this.options.serviceTokenIds!.map((tokenId) => ({
                service_token: { token_id: tokenId },
              })),
            }]
          : [],
      ],
    };
    await this.request(existing ? `/access/apps/${existing.id}` : "/access/apps", {
      method: existing ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
  }

  async remove(input: { applicationSlug: string; environmentName: string }): Promise<void> {
    const existing = await this.find(this.name(input.applicationSlug, input.environmentName));
    if (existing) await this.request(`/access/apps/${existing.id}`, { method: "DELETE" });
  }

  private name(slug: string, environment: string): string {
    return `zaodeploy-${slug}-${environment}`;
  }

  private async find(name: string): Promise<AccessApplication | null> {
    const applications = await this.request<AccessApplication[]>("/access/apps", { method: "GET" });
    return applications.find((application) => application.name === name) ?? null;
  }

  private async request<T = unknown>(pathname: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${this.options.accountId}${pathname}`,
      {
        ...init,
        headers: {
          authorization: `Bearer ${this.options.apiToken}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
      },
    );
    const envelope = (await response.json()) as CloudflareEnvelope<T>;
    if (!response.ok || !envelope.success) {
      throw new Error(
        envelope.errors?.map((error) => error.message).filter(Boolean).join("; ") ||
          `Cloudflare Access API returned HTTP ${response.status}`,
      );
    }
    return envelope.result;
  }
}

function pagesDestinations(hostname: string): string[] {
  const labels = hostname.split(".");
  if (hostname.endsWith(".pages.dev") && labels.length >= 3) {
    const projectDomain = labels.slice(-3).join(".");
    return [projectDomain, `*.${projectDomain}`];
  }
  return [hostname];
}
