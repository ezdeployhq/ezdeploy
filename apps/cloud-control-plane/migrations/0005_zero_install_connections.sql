ALTER TABLE cloud_agent_tokens ADD COLUMN expires_at TEXT;
ALTER TABLE cloud_agent_tokens ADD COLUMN token_kind TEXT NOT NULL DEFAULT 'persistent';
ALTER TABLE cloud_agent_tokens ADD COLUMN scopes_json TEXT NOT NULL DEFAULT '["*"]';

CREATE TABLE IF NOT EXISTS cloud_connect_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  label TEXT,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_connect_codes_hash
  ON cloud_connect_codes(code_hash, expires_at, redeemed_at);
