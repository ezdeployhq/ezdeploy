CREATE TABLE IF NOT EXISTS cloud_applications (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_environments (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  name TEXT NOT NULL,
  active_deployment_id TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(application_id, name)
);
CREATE TABLE IF NOT EXISTS cloud_deployments (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL,
  runtime TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  provider_deployment_id TEXT,
  url TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(application_id, environment_id, sequence)
);
CREATE TABLE IF NOT EXISTS cloud_resources (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  external_id TEXT NOT NULL,
  configuration_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(application_id, environment_id, kind)
);
CREATE TABLE IF NOT EXISTS cloud_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cloud_events_deployment ON cloud_events(deployment_id, id);
CREATE TABLE IF NOT EXISTS cloud_migrations (
  resource_id TEXT NOT NULL,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY(resource_id, name)
);
