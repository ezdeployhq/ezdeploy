export interface AiProvider {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKeyCiphertext: string;
  apiKeyIv: string;
  apiKeyLastFour: string;
  defaultModel: string;
  models: string[];
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastTestAt: string | null;
}

export interface SaveAiProvider {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKeyCiphertext: string;
  apiKeyIv: string;
  apiKeyLastFour: string;
  defaultModel: string;
  models: string[];
  enabled: boolean;
  isDefault: boolean;
}

export interface AiProviderStore {
  list(): Promise<AiProvider[]>;
  get(id: string): Promise<AiProvider | null>;
  getDefault(): Promise<AiProvider | null>;
  save(input: SaveAiProvider): Promise<AiProvider>;
  remove(id: string): Promise<boolean>;
  recordTest(id: string, status: "ready" | "failed", message: string): Promise<void>;
}

type ProviderRow = {
  id: string;
  name: string;
  provider_type: string;
  base_url: string;
  api_key_ciphertext: string;
  api_key_iv: string;
  api_key_last_four: string;
  default_model: string;
  models_json: string;
  enabled: number;
  is_default: number;
  created_at: string;
  updated_at: string;
  last_test_status: string | null;
  last_test_message: string | null;
  last_test_at: string | null;
};

function fromRow(row: ProviderRow): AiProvider {
  return {
    id: row.id,
    name: row.name,
    providerType: row.provider_type,
    baseUrl: row.base_url,
    apiKeyCiphertext: row.api_key_ciphertext,
    apiKeyIv: row.api_key_iv,
    apiKeyLastFour: row.api_key_last_four,
    defaultModel: row.default_model,
    models: JSON.parse(row.models_json) as string[],
    enabled: row.enabled === 1,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTestStatus: row.last_test_status,
    lastTestMessage: row.last_test_message,
    lastTestAt: row.last_test_at,
  };
}

export class D1AiProviderStore implements AiProviderStore {
  constructor(private readonly database: D1Database) {}

  async list(): Promise<AiProvider[]> {
    const rows = await this.database.prepare(
      "SELECT * FROM ai_providers ORDER BY is_default DESC, name",
    ).all<ProviderRow>();
    return rows.results.map(fromRow);
  }

  async get(id: string): Promise<AiProvider | null> {
    const row = await this.database.prepare("SELECT * FROM ai_providers WHERE id=?")
      .bind(id).first<ProviderRow>();
    return row ? fromRow(row) : null;
  }

  async getDefault(): Promise<AiProvider | null> {
    const row = await this.database.prepare(
      "SELECT * FROM ai_providers WHERE enabled=1 ORDER BY is_default DESC, updated_at DESC LIMIT 1",
    ).first<ProviderRow>();
    return row ? fromRow(row) : null;
  }

  async save(input: SaveAiProvider): Promise<AiProvider> {
    const timestamp = new Date().toISOString();
    if (input.isDefault) {
      await this.database.prepare("UPDATE ai_providers SET is_default=0,updated_at=?")
        .bind(timestamp).run();
    }
    await this.database.prepare(`
      INSERT INTO ai_providers (
        id,name,provider_type,base_url,api_key_ciphertext,api_key_iv,api_key_last_four,
        default_model,models_json,enabled,is_default,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,provider_type=excluded.provider_type,base_url=excluded.base_url,
        api_key_ciphertext=excluded.api_key_ciphertext,api_key_iv=excluded.api_key_iv,
        api_key_last_four=excluded.api_key_last_four,default_model=excluded.default_model,
        models_json=excluded.models_json,enabled=excluded.enabled,is_default=excluded.is_default,
        updated_at=excluded.updated_at
    `).bind(
      input.id, input.name, input.providerType, input.baseUrl, input.apiKeyCiphertext,
      input.apiKeyIv, input.apiKeyLastFour, input.defaultModel, JSON.stringify(input.models),
      input.enabled ? 1 : 0, input.isDefault ? 1 : 0, timestamp, timestamp,
    ).run();
    const saved = await this.get(input.id);
    if (!saved) throw new Error("Provider was not saved");
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.database.prepare("DELETE FROM ai_providers WHERE id=?")
      .bind(id).run();
    return result.meta.changes > 0;
  }

  async recordTest(id: string, status: "ready" | "failed", message: string): Promise<void> {
    await this.database.prepare(`
      UPDATE ai_providers SET last_test_status=?,last_test_message=?,last_test_at=?,updated_at=?
      WHERE id=?
    `).bind(status, message.slice(0, 500), new Date().toISOString(), new Date().toISOString(), id).run();
  }
}
