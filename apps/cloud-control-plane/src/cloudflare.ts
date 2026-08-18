import type { Asset, CloudResource, DeploymentBundle, Environment, Manifest } from "./types.js";

interface Envelope<T> { success: boolean; result: T; errors?: Array<{ code?: number; message?: string }> }

async function api<T>(env: Environment, pathname: string, init: RequestInit = {}, allow404 = false): Promise<T | null> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      ...(init.body && !(init.body instanceof FormData)
        ? { "content-type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  const body = await response.json<Envelope<T>>();
  if (allow404 && response.status === 404) return null;
  if (!response.ok || !body.success) throw new Error(body.errors?.map((item) => item.message).filter(Boolean).join("; ") || `Cloudflare API HTTP ${response.status}`);
  return body.result;
}

export async function rollbackPages(
  env: Environment,
  projectName: string,
  deploymentId: string,
) {
  await api(
    env,
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}/rollback`,
    { method: "POST", body: "{}" },
  );
}

export async function createPagesRuntimeTail(
  env: Environment,
  projectName: string,
  deploymentId: string,
) {
  const base = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}/tails`;
  const tail = await api<{ id: string; url: string }>(
    env,
    base,
    { method: "POST", body: JSON.stringify({}) },
  );
  if (!tail) throw new Error("Cloudflare did not create a Pages tail");
  return tail;
}

export async function deletePagesRuntimeTail(
  env: Environment,
  projectName: string,
  deploymentId: string,
  tailId: string,
) {
  await api(
    env,
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}/tails/${tailId}`,
    { method: "DELETE" },
  );
}

export async function destroyApplicationResources(
  env: Environment,
  projectName: string,
  applicationSlug: string,
  environmentName: string,
  boundResources: CloudResource[],
) {
  await api(
    env,
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}`,
    { method: "DELETE" },
    true,
  );
  const hostname = applicationHostname(env, applicationSlug, environmentName);
  if (hostname && env.CLOUDFLARE_ZONE_ID) {
    const records = await api<Array<{ id: string; name: string }>>(
      env,
      `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?name=${encodeURIComponent(hostname)}`,
    ) ?? [];
    for (const record of records.filter((item) => item.name === hostname)) {
      await api(
        env,
        `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${record.id}`,
        { method: "DELETE" },
      );
    }
  }
  for (const resource of boundResources) {
    if (resource.kind === "database") {
      await api(
        env,
        `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${resource.external_id}`,
        { method: "DELETE" },
        true,
      );
    } else if (resource.kind === "storage") {
      await api(
        env,
        `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/${resource.external_id}`,
        { method: "DELETE" },
        true,
      );
    } else {
      const response = await fetch(
        `${env.AI_PROXY_URL}/admin/v1/credentials/${encodeURIComponent(resource.external_id)}`,
        { method: "DELETE", headers: { authorization: `Bearer ${env.AI_CONTROL_TOKEN}` } },
      );
      if (!response.ok && response.status !== 404) {
        throw new Error(`AI credential revocation failed with HTTP ${response.status}`);
      }
    }
  }
  const accessName = `zaodeploy-${applicationSlug}-${environmentName}`;
  const apps = await api<Array<{ id: string; name: string }>>(
    env,
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/access/apps`,
  ) ?? [];
  const access = apps.find((item) => item.name === accessName);
  if (access) {
    await api(
      env,
      `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${access.id}`,
      { method: "DELETE" },
    );
  }
}

interface ProvisionedResource {
  externalId: string;
  configuration: Record<string, string>;
  secret?: string;
}

export async function provisionResource(
  env: Environment,
  kind: CloudResource["kind"],
  slug: string,
  environmentName: string,
  applicationId: string,
): Promise<ProvisionedResource> {
  const safe = `${slug}-${environmentName}`.replace(/[^a-z0-9-]/g, "-").slice(0, 36);
  if (kind === "database") {
    const name = `zao-${safe}-db`.slice(0, 32);
    const created = await api<{ uuid: string }>(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database`, { method: "POST", body: JSON.stringify({ name }) });
    if (!created) throw new Error("D1 creation returned no result");
    return { externalId: created.uuid, configuration: { binding: "DB", databaseId: created.uuid, databaseName: name } };
  }
  if (kind === "storage") {
    const name = `zao-${safe}-storage`.slice(0, 63);
    await api(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets`, { method: "POST", body: JSON.stringify({ name }) });
    return { externalId: name, configuration: { binding: "STORAGE", bucketName: name } };
  }
  const dailyBudget = Number(env.AI_DAILY_REQUEST_BUDGET ?? "");
  const response = await fetch(`${env.AI_PROXY_URL}/admin/v1/credentials`, {
    method: "POST", headers: { authorization: `Bearer ${env.AI_CONTROL_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({
      appId: applicationId,
      allowedModels: ["default-chat"],
      requestsPerMinute: 60,
      ...(Number.isFinite(dailyBudget) && dailyBudget > 0 ? { dailyRequestBudget: Math.floor(dailyBudget) } : {}),
    }),
  });
  if (!response.ok) throw new Error(`AI credential creation failed with HTTP ${response.status}`);
  const issued = await response.json<{ credentialId: string; virtualKey: string }>();
  return { externalId: issued.credentialId, configuration: { binding: "ZAO_AI_API_KEY", baseUrl: `${env.AI_PROXY_URL}/v1` }, secret: issued.virtualKey };
}

export async function applyMigrations(env: Environment, resource: CloudResource, migrations: DeploymentBundle["migrations"]) {
  for (const migration of migrations) {
    const applied = await env.DB.prepare("SELECT 1 FROM cloud_migrations WHERE resource_id=? AND name=?").bind(resource.id, migration.name).first();
    if (applied) continue;
    await api(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${resource.external_id}/query`, {
      method: "POST", body: JSON.stringify({ sql: migration.sql }),
    });
    await env.DB.prepare("INSERT INTO cloud_migrations (resource_id,name,applied_at) VALUES (?,?,?)")
      .bind(resource.id, migration.name, new Date().toISOString()).run();
  }
}

export async function deployPages(
  env: Environment, projectName: string, branch: string, bundle: DeploymentBundle,
  resources: CloudResource[], aiSecret?: string,
) {
  const projectPath = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}`;
  let project = await api<Record<string, any>>(env, projectPath, {}, true);
  if (!project) {
    project = await api<Record<string, any>>(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`, {
      method: "POST", body: JSON.stringify({ name: projectName, production_branch: branch }),
    });
  }
  if (!project) throw new Error("Pages project creation returned no result");
  const database = resources.find((item) => item.kind === "database");
  const storage = resources.find((item) => item.kind === "storage");
  const ai = resources.find((item) => item.kind === "ai");
  const config: Record<string, unknown> = {
    compatibility_date: "2026-07-15",
    d1_databases: database ? { DB: { id: database.external_id } } : {},
    r2_buckets: storage ? { STORAGE: { name: storage.external_id } } : {},
    env_vars: {
      ...(ai ? { ZAO_AI_BASE_URL: { type: "plain_text", value: JSON.parse(ai.configuration_json).baseUrl } } : {}),
      ...(aiSecret ? { ZAO_AI_API_KEY: { type: "secret_text", value: aiSecret } } : {}),
    },
  };
  await api(env, projectPath, { method: "PATCH", body: JSON.stringify({ deployment_configs: { production: config, preview: config } }) });
  const upload = await api<{ jwt: string }>(env, `${projectPath}/upload-token`);
  if (!upload?.jwt) throw new Error("Pages upload token missing");
  await uploadAssets(upload.jwt, bundle.assets);
  const form = pagesDeploymentForm(branch, bundle);
  const deployment = await api<{ id: string; url: string }>(env, `${projectPath}/deployments`, { method: "POST", body: form });
  if (!deployment) throw new Error("Pages deployment returned no result");
  await waitForPagesDeployment(env, projectPath, deployment.id);
  const pagesHostname = pagesProjectHostname(project, projectName);
  const pagesUrl = `https://${pagesHostname}`;
  const customHostname = applicationHostname(env, bundle.manifest.metadata.name, branch);
  const customUrl = customHostname
    ? await preparePagesCustomDomain(env, projectPath, customHostname, pagesHostname)
    : null;
  const stableUrl = customUrl ?? pagesUrl;
  return {
    id: deployment.id,
    stableUrl,
    pagesUrl,
    deploymentUrl: deployment.url,
    customHostname,
    projectPath,
  };
}

export function pagesDeploymentForm(branch: string, bundle: DeploymentBundle): FormData {
  const assetManifest = Object.fromEntries(bundle.assets.map((item) => [item.path, item.hash]));
  const form = new FormData();
  form.set("manifest", JSON.stringify(assetManifest));
  form.set("branch", branch);
  form.set("commit_dirty", "true");
  form.set("commit_message", "Deployed by EZdeploy online control plane");
  if (bundle.headers) form.set("_headers", new File([bundle.headers], "_headers"));
  if (bundle.redirects) form.set("_redirects", new File([bundle.redirects], "_redirects"));
  if (bundle.routes) form.set("_routes.json", new File([bundle.routes], "_routes.json", { type: "application/json" }));
  if (bundle.workerScript) {
    const multipart = /^--([^\r\n]+)\r?\n/.exec(bundle.workerScript);
    if (multipart) {
      // `wrangler pages functions build` emits a nested multipart module bundle.
      // Cloudflare needs its inner boundary in the file part's Content-Type;
      // without it the API accepts the deployment but silently omits Functions.
      form.set("_worker.bundle", new File([bundle.workerScript], "_worker.bundle", {
        type: `multipart/form-data; boundary=${multipart[1]}`,
      }));
    } else {
      form.set("_worker.js", new File([bundle.workerScript], "_worker.js", { type: "application/javascript+module" }));
    }
  }
  return form;
}

function applicationHostname(
  env: Environment,
  slug: string,
  environmentName: string,
): string | null {
  const suffix = env.APPLICATION_DOMAIN_SUFFIX?.trim().replace(/^\.+|\.+$/g, "");
  if (!suffix) return null;
  const label = environmentName === "production" ? slug : `${slug}-${environmentName}`;
  return `${label}.${suffix}`.toLowerCase();
}

export async function preparePagesCustomDomain(
  env: Environment,
  projectPath: string,
  hostname: string,
  pagesHostname: string,
): Promise<string> {
  if (!env.CLOUDFLARE_ZONE_ID) {
    throw new Error("CLOUDFLARE_ZONE_ID is required when APPLICATION_DOMAIN_SUFFIX is configured");
  }
  const target = pagesHostname;
  // Pages must know about the hostname before DNS points at pages.dev. Creating a
  // proxied CNAME first can be interpreted as a cross-account CNAME and return 1014.
  const domains = await api<Array<{ name: string; status: string }>>(
    env,
    `${projectPath}/domains`,
  ) ?? [];
  const existingDomain = domains.find((domain) => domain.name === hostname);
  if (existingDomain && existingDomain.status !== "active") {
    // A failed deployment can leave a pending association that never re-runs
    // validation after DNS is corrected. Reset it before retrying registration.
    await api(env, `${projectPath}/domains/${encodeURIComponent(hostname)}`, {
      method: "DELETE",
    });
  }
  if (!existingDomain || existingDomain.status !== "active") {
    await api(env, `${projectPath}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: hostname }),
    });
  }
  const records = await api<Array<{
    id: string;
    type: string;
    name: string;
    content: string;
    proxied: boolean;
  }>>(
    env,
    `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records?name=${encodeURIComponent(hostname)}`,
  ) ?? [];
  const exact = records.find((record) => record.name === hostname);
  const dnsBody = JSON.stringify({
    type: "CNAME",
    name: hostname,
    content: target,
    // DNS-only works for Pages-managed TLS and also supports zones that are not
    // owned by the Pages account. It avoids Cloudflare's cross-user proxy guard.
    proxied: false,
    ttl: 300,
  });
  if (!exact) {
    await api(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: "POST",
      body: dnsBody,
    });
  } else if (
    exact.type !== "CNAME" ||
    exact.content !== target ||
    exact.proxied !== false
  ) {
    await api(env, `/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${exact.id}`, {
      method: "PUT",
      body: dnsBody,
    });
  }
  if (!existingDomain || existingDomain.status !== "active") {
    // Adding a Pages domain before its external/DNS-only CNAME exists leaves
    // verification pending. PATCH is Cloudflare's documented validation retry
    // and is the API equivalent of "Check DNS records" in the dashboard.
    await api(env, `${projectPath}/domains/${encodeURIComponent(hostname)}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
  }
  return `https://${hostname}`;
}

export function pagesProjectHostname(
  project: Record<string, unknown>,
  projectName: string,
): string {
  const raw = typeof project.subdomain === "string" ? project.subdomain.trim() : "";
  const hostname = raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  return hostname.endsWith(".pages.dev") ? hostname : `${projectName}.pages.dev`;
}

export async function pagesCustomDomainStatus(
  env: Environment,
  projectPath: string,
  hostname: string,
): Promise<"active" | "pending"> {
  const domain = await api<{
    status: string;
    verification_data?: { error_message?: string };
  }>(
    env,
    `${projectPath}/domains/${encodeURIComponent(hostname)}`,
  );
  if (domain?.status === "active") return "active";
  if (domain?.status === "error" || domain?.status === "blocked") {
    throw new Error(
      domain.verification_data?.error_message ||
        `Custom domain ${hostname} entered ${domain.status} state`,
    );
  }
  return "pending";
}

async function uploadAssets(jwt: string, assets: Asset[]) {
  const missingResponse = await fetch("https://api.cloudflare.com/client/v4/pages/assets/check-missing", {
    method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ hashes: assets.map((item) => item.hash) }),
  });
  const missingBody = await missingResponse.json<Envelope<string[]>>();
  if (!missingResponse.ok || !missingBody.success) throw new Error("Unable to check Pages assets");
  const missing = new Set(missingBody.result);
  const pending = assets.filter((item) => missing.has(item.hash));
  for (let index = 0; index < pending.length; index += 40) {
    const payload = pending.slice(index, index + 40).map((item) => ({
      key: item.hash, value: item.base64, metadata: { contentType: item.contentType }, base64: true,
    }));
    const response = await fetch("https://api.cloudflare.com/client/v4/pages/assets/upload", {
      method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify(payload),
    });
    const body = await response.json<Envelope<unknown>>();
    if (!response.ok || !body.success) throw new Error(body.errors?.map((item) => item.message).join("; ") || "Pages asset upload failed");
  }
}

async function waitForPagesDeployment(
  env: Environment,
  projectPath: string,
  deploymentId: string,
) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const deployment = await api<{
      latest_stage?: { status?: string };
      stages?: Array<{ name?: string; status?: string }>;
    }>(env, `${projectPath}/deployments/${deploymentId}`);
    const status = deployment?.latest_stage?.status ??
      deployment?.stages?.find((stage) => stage.name === "deploy")?.status;
    if (status === "success") return;
    if (status === "failure") {
      const logs = await api<{ data?: Array<{ line?: string }> }>(
        env,
        `${projectPath}/deployments/${deploymentId}/history/logs?size=100000`,
      );
      throw new Error(
        logs?.data?.map((item) => item.line).filter(Boolean).join("\n") ||
          "Cloudflare Pages deployment failed",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("Cloudflare Pages deployment did not finish within 90 seconds");
}

export async function applyAccess(
  env: Environment,
  manifest: Manifest,
  branch: string,
  stableUrl: string,
  ownerId?: string,
) {
  const accessEnabled = env.ACCESS_ENABLED?.trim().toLowerCase() === "true";
  if (!accessEnabled) {
    if (manifest.spec.access.mode === "organization") {
      throw new Error("Organization access requires ACCESS_ENABLED=true and Cloudflare Access configuration");
    }
    return;
  }
  const name = `zaodeploy-${manifest.metadata.name}-${branch}`;
  const apps = await api<Array<{ id: string; name: string }>>(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/access/apps`) ?? [];
  const existing = apps.find((item) => item.name === name);
  if (manifest.spec.access.mode === "public") {
    if (existing) await api(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/access/apps/${existing.id}`, { method: "DELETE" });
    return;
  }
  const hostname = new URL(stableUrl).hostname;
  const groups = manifest.spec.access.allowedGroups.length ? manifest.spec.access.allowedGroups : [env.ACCESS_GROUP_ID];
  const employeeIncludes = [
    ...groups.map((id) => ({ group: { id } })),
    ...ownerId?.includes("@") ? [{ email: { email: ownerId } }] : [],
  ];
  const body = {
    name, type: "self_hosted", domain: hostname,
    destinations: [{ type: "public", uri: hostname }, { type: "public", uri: `*.${hostname}` }],
    app_launcher_visible: true, session_duration: "8h",
    policies: [
      { name: `${name}-allow`, decision: "allow", include: employeeIncludes },
      { name: `${name}-service`, decision: "non_identity", include: [{ service_token: { token_id: env.ACCESS_SERVICE_TOKEN_ID } }] },
    ],
  };
  await api(env, `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/access/apps${existing ? `/${existing.id}` : ""}`, {
    method: existing ? "PUT" : "POST", body: JSON.stringify(body),
  });
}

export async function verifyApplication(env: Environment, url: string, manifest: Manifest) {
  const deadline = Date.now() + Math.min(manifest.spec.healthCheck.timeoutSeconds, 15) * 1000;
  let last = "not attempted";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}${manifest.spec.healthCheck.path}`, {
        headers: { "CF-Access-Client-Id": env.ACCESS_CLIENT_ID, "CF-Access-Client-Secret": env.ACCESS_CLIENT_SECRET },
        redirect: "follow",
      });
      if (response.ok) {
        if (manifest.spec.healthCheck.expectedJson) {
          const actual = await response.json<Record<string, unknown>>();
          if (!Object.entries(manifest.spec.healthCheck.expectedJson).every(([key, value]) => actual[key] === value)) throw new Error("health JSON mismatch");
        }
        return;
      }
      last = `HTTP ${response.status}`;
    } catch (error) { last = error instanceof Error ? error.message : String(error); }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Health check failed: ${last}`);
}
