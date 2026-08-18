import type {
  AiCredential,
  AiCredentialStore,
  CreateCredentialInput,
  UsageRecord,
} from "./types.js";

export class D1AiCredentialStore implements AiCredentialStore {
  constructor(private readonly database: D1Database) {}

  async create(input: CreateCredentialInput): Promise<void> {
    await this.database
      .prepare(
        "INSERT INTO ai_credentials (" +
          "id, app_id, key_hash, allowed_models, requests_per_minute, daily_request_budget, active, created_at" +
        ") VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
      )
      .bind(
        input.id,
        input.appId,
        input.keyHash,
        JSON.stringify(input.allowedModels),
        input.requestsPerMinute,
        input.dailyRequestBudget ?? null,
        new Date().toISOString(),
      )
      .run();
  }

  async findByKeyHash(keyHash: string): Promise<AiCredential | null> {
    const row = await this.database
      .prepare(
        "SELECT id, app_id, key_hash, allowed_models, requests_per_minute, daily_request_budget, active " +
        "FROM ai_credentials WHERE key_hash = ?",
      )
      .bind(keyHash)
      .first<{
        id: string;
        app_id: string;
        key_hash: string;
        allowed_models: string;
        requests_per_minute: number;
        daily_request_budget: number | null;
        active: number;
      }>();
    if (!row) return null;
    return {
      id: row.id,
      appId: row.app_id,
      keyHash: row.key_hash,
      allowedModels: JSON.parse(row.allowed_models) as string[],
      requestsPerMinute: row.requests_per_minute,
      dailyRequestBudget: row.daily_request_budget ?? null,
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

  async minuteCount(appId: string, minute: string): Promise<number> {
    const row = await this.database
      .prepare("SELECT count FROM ai_usage_minute WHERE app_id = ? AND minute = ?")
      .bind(appId, minute)
      .first<{ count: number }>();
    return Number(row?.count ?? 0);
  }

  async dailyRequestTotal(appId: string, day: string): Promise<number> {
    const row = await this.database
      .prepare("SELECT COALESCE(SUM(requests), 0) AS total FROM ai_usage_daily WHERE app_id = ? AND day = ?")
      .bind(appId, day)
      .first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    const isError = record.statusCode >= 400 ? 1 : 0;
    const minuteFloor = new Date(Date.parse(record.minute) - 10 * 60_000).toISOString().slice(0, 16);
    await this.database.batch([
      this.database
        .prepare(
          "INSERT INTO ai_usage_minute (app_id, minute, count) VALUES (?, ?, 1) " +
          "ON CONFLICT(app_id, minute) DO UPDATE SET count = count + 1",
        )
        .bind(record.appId, record.minute),
      this.database
        .prepare(
          "INSERT INTO ai_usage_daily (app_id, day, model_alias, requests, errors, input_tokens, output_tokens) " +
          "VALUES (?, ?, ?, 1, ?, ?, ?) " +
          "ON CONFLICT(app_id, day, model_alias) DO UPDATE SET " +
          "requests = requests + 1, errors = errors + excluded.errors, " +
          "input_tokens = input_tokens + excluded.input_tokens, " +
          "output_tokens = output_tokens + excluded.output_tokens",
        )
        .bind(record.appId, record.day, record.modelAlias, isError, record.inputTokens, record.outputTokens),
      this.database
        .prepare("DELETE FROM ai_usage_minute WHERE minute < ?")
        .bind(minuteFloor),
    ]);
  }
}
