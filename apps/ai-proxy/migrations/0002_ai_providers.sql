CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  api_key_iv TEXT NOT NULL,
  api_key_last_four TEXT NOT NULL,
  default_model TEXT NOT NULL,
  models_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_test_status TEXT,
  last_test_message TEXT,
  last_test_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled_default
  ON ai_providers(enabled, is_default);
