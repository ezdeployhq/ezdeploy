import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type {
  AccessPolicy,
  Application,
  Deployment,
  DeploymentStatus,
  Environment,
  ResourceBinding,
} from "@ezdeploy/contracts";
import { EZdeployError } from "@ezdeploy/contracts";
import { assertStatusTransition } from "./state-machine.js";

type Row = Record<string, unknown>;

function now(): string {
  return new Date().toISOString();
}

export class ControlPlaneRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  close(): void {
    this.database.close();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS environments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        active_deployment_id TEXT,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(application_id, name)
      );

      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        sequence INTEGER NOT NULL,
        status TEXT NOT NULL,
        runtime TEXT NOT NULL,
        source_directory TEXT NOT NULL,
        manifest_digest TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        provider_deployment_id TEXT,
        url TEXT,
        error_code TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(application_id, environment_id, sequence)
      );

      CREATE TABLE IF NOT EXISTS resource_bindings (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        secret_reference TEXT NOT NULL,
        configuration TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(application_id, environment_id, kind)
      );

      CREATE TABLE IF NOT EXISTS access_policies (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        environment_id TEXT NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
        mode TEXT NOT NULL,
        allowed_groups TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(application_id, environment_id)
      );

      CREATE TABLE IF NOT EXISTS deployment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deployment_id TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deployment_cleanup (
        deployment_id TEXT PRIMARY KEY REFERENCES deployments(id) ON DELETE CASCADE,
        provider_destroyed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    this.ensureColumn("deployments", "manifest_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("resource_bindings", "configuration", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("environments", "active_deployment_id", "TEXT");
    this.ensureColumn("environments", "deleted_at", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((candidate) => candidate.name === column)) {
      this.database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  upsertApplication(slug: string, displayName: string, ownerId: string): Application {
    const existing = this.getApplicationBySlug(slug);
    const timestamp = now();
    if (existing) {
      if (existing.ownerId !== ownerId) {
        throw new EZdeployError(
          "FORBIDDEN",
          `Application slug '${slug}' is already owned by another employee`,
        );
      }
      this.database
        .prepare("UPDATE applications SET display_name = ?, updated_at = ? WHERE id = ?")
        .run(displayName, timestamp, existing.id);
      return { ...existing, displayName, updatedAt: timestamp };
    }

    const application: Application = {
      id: randomUUID(),
      slug,
      displayName,
      ownerId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.database
      .prepare(
        "INSERT INTO applications (id, slug, display_name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        application.id,
        application.slug,
        application.displayName,
        application.ownerId,
        application.createdAt,
        application.updatedAt,
      );
    return application;
  }

  getApplicationBySlug(slug: string): Application | null {
    const row = this.database.prepare("SELECT * FROM applications WHERE slug = ?").get(slug) as
      | Row
      | undefined;
    return row ? this.mapApplication(row) : null;
  }

  upsertEnvironment(applicationId: string, name: string, provider: string): Environment {
    const row = this.database
      .prepare("SELECT * FROM environments WHERE application_id = ? AND name = ?")
      .get(applicationId, name) as Row | undefined;
    if (row) {
      this.database.prepare(
        "UPDATE environments SET provider = ?, deleted_at = NULL WHERE id = ?",
      ).run(provider, String(row.id));
      return this.mapEnvironment({ ...row, provider });
    }

    const environment: Environment = {
      id: randomUUID(),
      applicationId,
      name,
      provider,
      createdAt: now(),
    };
    this.database
      .prepare(
        "INSERT INTO environments (id, application_id, name, provider, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        environment.id,
        environment.applicationId,
        environment.name,
        environment.provider,
        environment.createdAt,
      );
    return environment;
  }

  createDeployment(input: {
    applicationId: string;
    environmentId: string;
    runtime: Deployment["runtime"];
    sourceDirectory: string;
    manifestDigest: string;
    manifestJson: string;
  }): Deployment {
    const next = this.database
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM deployments WHERE application_id = ? AND environment_id = ?",
      )
      .get(input.applicationId, input.environmentId) as { sequence: number };
    const timestamp = now();
    const deployment: Deployment = {
      id: randomUUID(),
      applicationId: input.applicationId,
      environmentId: input.environmentId,
      runtime: input.runtime,
      sourceDirectory: input.sourceDirectory,
      manifestDigest: input.manifestDigest,
      sequence: Number(next.sequence),
      status: "queued",
      providerDeploymentId: null,
      url: null,
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.database
      .prepare(`
        INSERT INTO deployments (
          id, application_id, environment_id, sequence, status, runtime,
          source_directory, manifest_digest, manifest_json, provider_deployment_id, url,
          error_code, error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        deployment.id,
        deployment.applicationId,
        deployment.environmentId,
        deployment.sequence,
        deployment.status,
        deployment.runtime,
        deployment.sourceDirectory,
        deployment.manifestDigest,
        input.manifestJson,
        null,
        null,
        null,
        null,
        deployment.createdAt,
        deployment.updatedAt,
      );
    this.addEvent(deployment.id, "queued", "Deployment queued");
    return deployment;
  }

  getDeployment(id: string): Deployment {
    const row = this.database.prepare("SELECT * FROM deployments WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (!row) {
      throw new EZdeployError("DEPLOYMENT_NOT_FOUND", `Deployment ${id} was not found`);
    }
    return this.mapDeployment(row);
  }

  getDeploymentManifest(id: string): string {
    const row = this.database
      .prepare("SELECT manifest_json FROM deployments WHERE id = ?")
      .get(id) as { manifest_json: string } | undefined;
    if (!row) {
      throw new EZdeployError("DEPLOYMENT_NOT_FOUND", `Deployment ${id} was not found`);
    }
    return row.manifest_json;
  }

  getApplication(id: string): Application {
    const row = this.database.prepare("SELECT * FROM applications WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (!row) throw new Error(`Application ${id} was not found`);
    return this.mapApplication(row);
  }

  getEnvironment(id: string): Environment {
    const row = this.database.prepare("SELECT * FROM environments WHERE id = ?").get(id) as
      | Row
      | undefined;
    if (!row) throw new Error(`Environment ${id} was not found`);
    return this.mapEnvironment(row);
  }

  setActiveDeployment(environmentId: string, deploymentId: string | null): void {
    if (deploymentId) {
      const deployment = this.getDeployment(deploymentId);
      if (deployment.environmentId !== environmentId || deployment.status !== "ready") {
        throw new EZdeployError(
          "INVALID_STATE_TRANSITION",
          "Only a ready deployment in the same environment can become active",
        );
      }
    }
    this.database
      .prepare("UPDATE environments SET active_deployment_id = ? WHERE id = ?")
      .run(deploymentId, environmentId);
  }

  getActiveDeployment(environmentId: string): Deployment | null {
    const row = this.database
      .prepare("SELECT active_deployment_id FROM environments WHERE id = ?")
      .get(environmentId) as { active_deployment_id: string | null } | undefined;
    return row?.active_deployment_id ? this.getDeployment(row.active_deployment_id) : null;
  }

  listCatalog(): Array<{
    application: Application;
    environment: Environment;
    deployment: Deployment | null;
    access: AccessPolicy | null;
    resources: Array<Pick<ResourceBinding, "kind" | "provider">>;
    recentDeployments: Deployment[];
  }> {
    const rows = this.database.prepare(`
      SELECT
        a.id AS a_id, a.slug AS a_slug, a.display_name AS a_display_name,
        a.owner_id AS a_owner_id, a.created_at AS a_created_at, a.updated_at AS a_updated_at,
        e.id AS e_id, e.application_id AS e_application_id, e.name AS e_name,
        e.provider AS e_provider, e.created_at AS e_created_at, e.active_deployment_id,
        p.id AS p_id, p.mode AS p_mode, p.allowed_groups AS p_allowed_groups,
        p.created_at AS p_created_at, p.updated_at AS p_updated_at
      FROM applications a
      JOIN environments e ON e.application_id = a.id
      LEFT JOIN access_policies p ON p.environment_id = e.id
      WHERE e.deleted_at IS NULL
      ORDER BY a.display_name, e.name
    `).all() as Row[];
    return rows.map((row) => ({
      application: this.mapApplication({
        id: row.a_id, slug: row.a_slug, display_name: row.a_display_name,
        owner_id: row.a_owner_id, created_at: row.a_created_at, updated_at: row.a_updated_at,
      }),
      environment: this.mapEnvironment({
        id: row.e_id, application_id: row.e_application_id, name: row.e_name,
        provider: row.e_provider, created_at: row.e_created_at,
      }),
      deployment: row.active_deployment_id
        ? this.getDeployment(String(row.active_deployment_id))
        : null,
      access: row.p_id
        ? this.mapAccessPolicy({
            id: row.p_id, application_id: row.e_application_id, environment_id: row.e_id,
            mode: row.p_mode, allowed_groups: row.p_allowed_groups,
            created_at: row.p_created_at, updated_at: row.p_updated_at,
          })
        : null,
      resources: this.listResourceBindings(String(row.a_id), String(row.e_id)).map(
        ({ kind, provider }) => ({ kind, provider }),
      ),
      recentDeployments: this.listDeployments(String(row.e_id), 10),
    }));
  }

  listDeployments(environmentId: string, limit = 20): Deployment[] {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
    const rows = this.database
      .prepare("SELECT * FROM deployments WHERE environment_id = ? ORDER BY sequence DESC LIMIT ?")
      .all(environmentId, safeLimit) as Row[];
    return rows.map((row) => this.mapDeployment(row));
  }

  listAllDeployments(environmentId: string): Deployment[] {
    const rows = this.database
      .prepare("SELECT * FROM deployments WHERE environment_id = ? ORDER BY sequence DESC")
      .all(environmentId) as Row[];
    return rows.map((row) => this.mapDeployment(row));
  }

  archiveEnvironment(environmentId: string): void {
    this.database
      .prepare("UPDATE environments SET active_deployment_id = NULL, deleted_at = ? WHERE id = ?")
      .run(now(), environmentId);
  }

  updateDeploymentStatus(
    id: string,
    status: DeploymentStatus,
    message: string,
    fields: Partial<
      Pick<Deployment, "providerDeploymentId" | "url" | "errorCode" | "errorMessage">
    > = {},
    eventDetails?: Record<string, unknown>,
  ): Deployment {
    const current = this.getDeployment(id);
    assertStatusTransition(current.status, status);
    const updatedAt = now();
    const updated = { ...current, ...fields, status, updatedAt };
    this.database
      .prepare(`
        UPDATE deployments
        SET status = ?, provider_deployment_id = ?, url = ?, error_code = ?, error_message = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(
        status,
        updated.providerDeploymentId,
        updated.url,
        updated.errorCode,
        updated.errorMessage,
        updatedAt,
        id,
      );
    this.addEvent(id, status, message, eventDetails);
    return updated;
  }

  updateDeploymentEndpoint(
    id: string,
    providerDeploymentId: string,
    url: string,
  ): Deployment {
    const current = this.getDeployment(id);
    const updatedAt = now();
    this.database.prepare(`
      UPDATE deployments SET provider_deployment_id = ?, url = ?, updated_at = ? WHERE id = ?
    `).run(providerDeploymentId, url, updatedAt, id);
    return { ...current, providerDeploymentId, url, updatedAt };
  }

  upsertResourceBinding(
    binding: Omit<ResourceBinding, "id" | "createdAt">,
  ): ResourceBinding {
    const row = this.database
      .prepare(
        "SELECT * FROM resource_bindings WHERE application_id = ? AND environment_id = ? AND kind = ?",
      )
      .get(binding.applicationId, binding.environmentId, binding.kind) as Row | undefined;
    if (row) return this.mapResourceBinding(row);

    const result: ResourceBinding = { id: randomUUID(), ...binding, createdAt: now() };
    this.database
      .prepare(`
        INSERT INTO resource_bindings (
          id, application_id, environment_id, kind, provider, external_id,
          secret_reference, configuration, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        result.id,
        result.applicationId,
        result.environmentId,
        result.kind,
        result.provider,
        result.externalId,
        result.secretReference,
        JSON.stringify(result.configuration),
        result.createdAt,
      );
    return result;
  }

  listResourceBindings(applicationId: string, environmentId: string): ResourceBinding[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM resource_bindings WHERE application_id = ? AND environment_id = ? ORDER BY kind",
      )
      .all(applicationId, environmentId) as Row[];
    return rows.map((row) => this.mapResourceBinding(row));
  }

  deleteResourceBindings(applicationId: string, environmentId: string): void {
    this.database
      .prepare("DELETE FROM resource_bindings WHERE application_id = ? AND environment_id = ?")
      .run(applicationId, environmentId);
  }

  deleteResourceBinding(id: string): void {
    this.database.prepare("DELETE FROM resource_bindings WHERE id = ?").run(id);
  }

  upsertAccessPolicy(input: Omit<AccessPolicy, "id" | "createdAt" | "updatedAt">): AccessPolicy {
    const existing = this.database
      .prepare("SELECT * FROM access_policies WHERE application_id = ? AND environment_id = ?")
      .get(input.applicationId, input.environmentId) as Row | undefined;
    const timestamp = now();
    if (existing) {
      const mapped = this.mapAccessPolicy(existing);
      this.database
        .prepare(
          "UPDATE access_policies SET mode = ?, allowed_groups = ?, updated_at = ? WHERE id = ?",
        )
        .run(input.mode, JSON.stringify(input.allowedGroups), timestamp, mapped.id);
      return { ...mapped, ...input, updatedAt: timestamp };
    }
    const policy: AccessPolicy = {
      id: randomUUID(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.database
      .prepare(`
        INSERT INTO access_policies (
          id, application_id, environment_id, mode, allowed_groups, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        policy.id,
        policy.applicationId,
        policy.environmentId,
        policy.mode,
        JSON.stringify(policy.allowedGroups),
        policy.createdAt,
        policy.updatedAt,
      );
    return policy;
  }

  listEvents(deploymentId: string): Array<{
    status: DeploymentStatus;
    message: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }> {
    const rows = this.database
      .prepare(
        "SELECT status, message, details, created_at FROM deployment_events WHERE deployment_id = ? ORDER BY id",
      )
      .all(deploymentId) as Row[];
    return rows.map((row) => ({
      status: String(row.status) as DeploymentStatus,
      message: String(row.message),
      details: row.details ? JSON.parse(String(row.details)) as Record<string, unknown> : null,
      createdAt: String(row.created_at),
    }));
  }

  appendProviderLogs(deploymentId: string, source: string, messages: string[]): void {
    const insert = this.database.prepare(
      "INSERT INTO provider_logs (deployment_id, source, message, created_at) VALUES (?, ?, ?, ?)",
    );
    for (const message of messages.filter(Boolean)) {
      insert.run(deploymentId, source, message, now());
    }
  }

  listProviderLogs(deploymentId: string): Array<{
    source: string;
    message: string;
    createdAt: string;
  }> {
    const rows = this.database
      .prepare("SELECT source, message, created_at FROM provider_logs WHERE deployment_id = ? ORDER BY id")
      .all(deploymentId) as Row[];
    return rows.map((row) => ({
      source: String(row.source),
      message: String(row.message),
      createdAt: String(row.created_at),
    }));
  }

  isProviderDestroyed(deploymentId: string): boolean {
    const row = this.database
      .prepare("SELECT provider_destroyed FROM deployment_cleanup WHERE deployment_id = ?")
      .get(deploymentId) as { provider_destroyed: number } | undefined;
    return row?.provider_destroyed === 1;
  }

  markProviderDestroyed(deploymentId: string): void {
    this.database.prepare(`
      INSERT INTO deployment_cleanup (deployment_id, provider_destroyed, updated_at)
      VALUES (?, 1, ?)
      ON CONFLICT(deployment_id) DO UPDATE SET provider_destroyed = 1, updated_at = excluded.updated_at
    `).run(deploymentId, now());
  }

  private addEvent(
    deploymentId: string,
    status: DeploymentStatus,
    message: string,
    details?: Record<string, unknown>,
  ): void {
    this.database
      .prepare(
        "INSERT INTO deployment_events (deployment_id, status, message, details, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(deploymentId, status, message, details ? JSON.stringify(details) : null, now());
  }

  private mapApplication(row: Row): Application {
    return {
      id: String(row.id),
      slug: String(row.slug),
      displayName: String(row.display_name),
      ownerId: String(row.owner_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapEnvironment(row: Row): Environment {
    return {
      id: String(row.id),
      applicationId: String(row.application_id),
      name: String(row.name),
      provider: String(row.provider),
      createdAt: String(row.created_at),
    };
  }

  private mapDeployment(row: Row): Deployment {
    return {
      id: String(row.id),
      applicationId: String(row.application_id),
      environmentId: String(row.environment_id),
      sequence: Number(row.sequence),
      status: String(row.status) as DeploymentStatus,
      runtime: String(row.runtime) as Deployment["runtime"],
      sourceDirectory: String(row.source_directory),
      manifestDigest: String(row.manifest_digest),
      providerDeploymentId: row.provider_deployment_id
        ? String(row.provider_deployment_id)
        : null,
      url: row.url ? String(row.url) : null,
      errorCode: row.error_code ? String(row.error_code) : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapResourceBinding(row: Row): ResourceBinding {
    return {
      id: String(row.id),
      applicationId: String(row.application_id),
      environmentId: String(row.environment_id),
      kind: String(row.kind) as ResourceBinding["kind"],
      provider: String(row.provider),
      externalId: String(row.external_id),
      secretReference: String(row.secret_reference),
      configuration: JSON.parse(String(row.configuration)) as Record<string, string>,
      createdAt: String(row.created_at),
    };
  }

  private mapAccessPolicy(row: Row): AccessPolicy {
    return {
      id: String(row.id),
      applicationId: String(row.application_id),
      environmentId: String(row.environment_id),
      mode: String(row.mode) as AccessPolicy["mode"],
      allowedGroups: JSON.parse(String(row.allowed_groups)) as string[],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
