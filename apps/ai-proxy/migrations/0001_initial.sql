CREATE TABLE IF NOT EXISTS ai_credentials (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  allowed_models TEXT NOT NULL,
  requests_per_minute INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_credentials_key_hash
  ON ai_credentials(key_hash);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  model_alias TEXT NOT NULL,
  upstream_model TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_app_created
  ON ai_usage_events(app_id, created_at);
