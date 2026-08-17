import type {
  AiCredential,
  AiCredentialStore,
  CreateCredentialInput,
  UsageEvent,
} from "./types.js";

export class D1AiCredentialStore implements AiCredentialStore {
  constructor(private readonly database: D1Database) {}

  async create(input: CreateCredentialInput): Promise<void> {
    await this.database
      .prepare(`
        INSERT INTO ai_credentials (
          id, app_id, key_hash, allowed_models, requests_per_minute, active, created_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?)
      `)
      .bind(
        input.id,
        input.appId,
        input.keyHash,
        JSON.stringify(input.allowedModels),
        input.requestsPerMinute,
        new Date().toISOString(),
      )
      .run();
  }

  async findByKeyHash(keyHash: string): Promise<AiCredential | null> {
    const row = await this.database
      .prepare(`
        SELECT id, app_id, key_hash, allowed_models, requests_per_minute, active
        FROM ai_credentials WHERE key_hash = ?
      `)
      .bind(keyHash)
      .first<{
        id: string;
        app_id: string;
        key_hash: string;
        allowed_models: string;
        requests_per_minute: number;
        active: number;
      }>();
    if (!row) return null;
    return {
      id: row.id,
      appId: row.app_id,
      keyHash: row.key_hash,
      allowedModels: JSON.parse(row.allowed_models) as string[],
      requestsPerMinute: row.requests_per_minute,
      active: row.active === 1,
    };
  }

  async revoke(id: string): Promise<boolean> {
    const result = await this.database
      .prepare("UPDATE ai_credentials SET active = 0, revoked_at = ? WHERE id = ? AND active = 1")
      .bind(new Date().toISOString(), id)
      .run();
    return result.meta.changes > 0;
  }

  async countRecentRequests(appId: string, since: string): Promise<number> {
    const row = await this.database
      .prepare("SELECT COUNT(*) AS count FROM ai_usage_events WHERE app_id = ? AND created_at >= ?")
      .bind(appId, since)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    await this.database
      .prepare(`
        INSERT INTO ai_usage_events (
          credential_id, app_id, model_alias, upstream_model, endpoint, status_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        event.credentialId,
        event.appId,
        event.modelAlias,
        event.upstreamModel,
        event.endpoint,
        event.statusCode,
        event.createdAt,
      )
      .run();
  }
}
