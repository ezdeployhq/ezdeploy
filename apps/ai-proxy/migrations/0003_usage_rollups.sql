-- Aggregated usage accounting: bounded rollup tables replace per-request event rows
-- so free-tier D1 write allowances and table growth stay predictable.
CREATE TABLE IF NOT EXISTS ai_usage_minute (
  app_id TEXT NOT NULL,
  minute TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, minute)
);

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  app_id TEXT NOT NULL,
  day TEXT NOT NULL,
  model_alias TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, day, model_alias)
);

ALTER TABLE ai_credentials ADD COLUMN daily_request_budget INTEGER;
