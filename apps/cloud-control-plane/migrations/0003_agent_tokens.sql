CREATE TABLE IF NOT EXISTS cloud_agent_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cloud_agent_tokens_hash
  ON cloud_agent_tokens(token_hash, active);
