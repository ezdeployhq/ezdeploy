CREATE TABLE IF NOT EXISTS cloud_access_policies (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  environment_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  allowed_groups_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO cloud_access_policies (
  id, application_id, environment_id, mode, allowed_groups_json, created_at, updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  e.application_id,
  e.id,
  json_extract(d.manifest_json, '$.spec.access.mode'),
  json_extract(d.manifest_json, '$.spec.access.allowedGroups'),
  d.created_at,
  d.updated_at
FROM cloud_environments e
JOIN cloud_deployments d ON d.id = e.active_deployment_id;
