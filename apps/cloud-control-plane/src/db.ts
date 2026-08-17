import type { Environment, Manifest, CloudResource } from "./types.js";

const now = () => new Date().toISOString();

export async function addEvent(env: Environment, id: string, status: string, message: string, details?: unknown) {
  await env.DB.prepare(
    "INSERT INTO cloud_events (deployment_id,status,message,details_json,created_at) VALUES (?,?,?,?,?)",
  ).bind(id, status, message, details ? JSON.stringify(details) : null, now()).run();
}

export async function setStatus(
  env: Environment,
  id: string,
  status: string,
  message: string,
  fields: { providerId?: string; url?: string; errorCode?: string; errorMessage?: string } = {},
) {
  await env.DB.prepare(`UPDATE cloud_deployments SET status=?, provider_deployment_id=COALESCE(?,provider_deployment_id),
    url=COALESCE(?,url), error_code=?, error_message=?, updated_at=? WHERE id=?`)
    .bind(status, fields.providerId ?? null, fields.url ?? null, fields.errorCode ?? null, fields.errorMessage ?? null, now(), id).run();
  await addEvent(env, id, status, message, fields);
}

export async function createDeployment(
  env: Environment,
  ownerId: string,
  environmentName: string,
  manifest: Manifest,
  artifactKey: string,
  digest: string,
) {
  const timestamp = now();
  let app = await env.DB.prepare("SELECT * FROM cloud_applications WHERE slug=?").bind(manifest.metadata.name).first<Record<string, unknown>>();
  if (app && app.owner_id !== ownerId) throw new Error("Application slug belongs to another owner");
  if (!app) {
    app = { id: crypto.randomUUID(), slug: manifest.metadata.name, owner_id: ownerId };
    await env.DB.prepare(`INSERT INTO cloud_applications
      (id,slug,display_name,description,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(app.id, manifest.metadata.name, manifest.metadata.displayName ?? manifest.metadata.name,
        manifest.metadata.description ?? null, ownerId, timestamp, timestamp).run();
  } else {
    await env.DB.prepare("UPDATE cloud_applications SET display_name=?,description=?,updated_at=? WHERE id=?")
      .bind(manifest.metadata.displayName ?? manifest.metadata.name, manifest.metadata.description ?? null, timestamp, app.id).run();
  }
  let target = await env.DB.prepare("SELECT * FROM cloud_environments WHERE application_id=? AND name=?")
    .bind(app.id, environmentName).first<Record<string, unknown>>();
  if (!target) {
    target = { id: crypto.randomUUID() };
    await env.DB.prepare(`INSERT INTO cloud_environments (id,application_id,name,created_at) VALUES (?,?,?,?)`)
      .bind(target.id, app.id, environmentName, timestamp).run();
  } else {
    await env.DB.prepare("UPDATE cloud_environments SET deleted_at=NULL WHERE id=?").bind(target.id).run();
  }
  await env.DB.prepare(`INSERT INTO cloud_access_policies
    (id,application_id,environment_id,mode,allowed_groups_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(environment_id) DO UPDATE SET
      mode=excluded.mode,allowed_groups_json=excluded.allowed_groups_json,updated_at=excluded.updated_at`)
    .bind(
      crypto.randomUUID(),
      app.id,
      target.id,
      manifest.spec.access.mode,
      JSON.stringify(manifest.spec.access.allowedGroups),
      timestamp,
      timestamp,
    ).run();
  const sequenceRow = await env.DB.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS value FROM cloud_deployments WHERE environment_id=?")
    .bind(target.id).first<{ value: number }>();
  const deployment = {
    id: crypto.randomUUID(), applicationId: String(app.id), environmentId: String(target.id),
    sequence: Number(sequenceRow?.value ?? 1), status: "queued", runtime: manifest.spec.runtime,
    artifactKey, artifactDigest: digest, createdAt: timestamp, updatedAt: timestamp,
  };
  await env.DB.prepare(`INSERT INTO cloud_deployments
    (id,application_id,environment_id,sequence,status,runtime,artifact_key,artifact_digest,manifest_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(deployment.id, deployment.applicationId, deployment.environmentId,
      deployment.sequence, deployment.status, deployment.runtime, artifactKey, digest, JSON.stringify(manifest), timestamp, timestamp).run();
  await addEvent(env, deployment.id, "queued", "Deployment accepted by online control plane");
  return deployment;
}

export interface DeploymentContext {
  artifact_key: string;
  application_id: string;
  environment_id: string;
  environment_name: string;
  owner_id: string;
  provider_deployment_id: string | null;
  slug: string;
  url: string | null;
}

export async function deploymentContext(env: Environment, id: string) {
  const row = await env.DB.prepare(`SELECT d.*,a.slug,a.display_name,a.owner_id,e.name AS environment_name
    FROM cloud_deployments d JOIN cloud_applications a ON a.id=d.application_id
    JOIN cloud_environments e ON e.id=d.environment_id WHERE d.id=?`).bind(id).first<DeploymentContext>();
  if (!row) throw new Error(`Deployment ${id} not found`);
  return row;
}

export async function resources(env: Environment, applicationId: string, environmentId: string) {
  const result = await env.DB.prepare("SELECT * FROM cloud_resources WHERE application_id=? AND environment_id=? ORDER BY kind")
    .bind(applicationId, environmentId).all<CloudResource>();
  return result.results;
}

export async function saveResource(
  env: Environment, applicationId: string, environmentId: string,
  kind: CloudResource["kind"], externalId: string, configuration: Record<string, string>,
) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO cloud_resources
    (id,application_id,environment_id,kind,external_id,configuration_json,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(id, applicationId, environmentId, kind, externalId, JSON.stringify(configuration), now()).run();
  return { id, kind, external_id: externalId, configuration_json: JSON.stringify(configuration) } satisfies CloudResource;
}

export async function activate(env: Environment, environmentId: string, deploymentId: string) {
  await env.DB.prepare("UPDATE cloud_environments SET active_deployment_id=? WHERE id=?").bind(deploymentId, environmentId).run();
}

export async function catalog(env: Environment) {
  const rows = await env.DB.prepare(`SELECT a.id,a.slug,a.display_name,a.description,a.owner_id,e.id AS environment_id,
    e.name AS environment_name,d.id AS deployment_id,d.sequence,d.status,d.url,d.updated_at
    FROM cloud_applications a JOIN cloud_environments e ON e.application_id=a.id
    LEFT JOIN cloud_deployments d ON d.id=e.active_deployment_id WHERE e.deleted_at IS NULL
    ORDER BY a.display_name,e.name`).all<Record<string, unknown>>();
  const output = [];
  for (const row of rows.results) {
    const capabilities = await resources(env, String(row.id), String(row.environment_id));
    const versions = await env.DB.prepare(
      "SELECT id,sequence,status,url,error_code,error_message,created_at,updated_at FROM cloud_deployments WHERE environment_id=? ORDER BY sequence DESC LIMIT 10",
    ).bind(row.environment_id).all<Record<string, unknown>>();
    const active = row.deployment_id
      ? await env.DB.prepare("SELECT manifest_json FROM cloud_deployments WHERE id=?")
          .bind(row.deployment_id).first<{ manifest_json: string }>()
      : null;
    const access = active
      ? (JSON.parse(active.manifest_json) as Manifest).spec.access
      : null;
    output.push({
      application: { id: row.id, slug: row.slug, displayName: row.display_name, description: row.description, ownerId: row.owner_id },
      environment: { id: row.environment_id, name: row.environment_name },
      deployment: row.deployment_id ? { id: row.deployment_id, sequence: row.sequence, status: row.status, url: row.url, updatedAt: row.updated_at } : null,
      access,
      resources: capabilities.map((item) => ({ kind: item.kind, provider: item.kind === "ai" ? "zaodeploy-ai" : "cloudflare" })),
      recentDeployments: versions.results.map((item) => ({
        id: item.id,
        sequence: item.sequence,
        status: item.status,
        url: item.url,
        errorCode: item.error_code,
        errorMessage: item.error_message,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    });
  }
  return output;
}
