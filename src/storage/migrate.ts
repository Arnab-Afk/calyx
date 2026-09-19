import { getPool, closePool } from "./client.js";

const DDL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS events (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    TEXT        NOT NULL,
  timestamp    TIMESTAMPTZ NOT NULL,
  service      TEXT        NOT NULL,
  level        TEXT        NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  message      TEXT        NOT NULL,
  trace_id     TEXT,
  span_id      TEXT,
  attributes   JSONB       NOT NULL DEFAULT '{}',
  content_hash TEXT        NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_dedup UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS events_tenant_time    ON events (tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS events_tenant_service ON events (tenant_id, service, timestamp DESC);
CREATE INDEX IF NOT EXISTS events_tenant_level   ON events (tenant_id, level, timestamp DESC);
CREATE INDEX IF NOT EXISTS events_attrs          ON events USING GIN (attributes);

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  key_prefix   TEXT        NOT NULL UNIQUE,
  token_hash   BYTEA       NOT NULL,
  scopes       TEXT[]      NOT NULL DEFAULT ARRAY['logs:read'],
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mcp_api_keys_tenant ON mcp_api_keys (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mgmt_api_keys (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  key_prefix   TEXT        NOT NULL UNIQUE,
  token_hash   BYTEA       NOT NULL,
  scopes       TEXT[]      NOT NULL DEFAULT ARRAY['projects:write','sources:write','integrations:write'],
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mgmt_api_keys_tenant ON mgmt_api_keys (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  environment  TEXT        NOT NULL DEFAULT 'production',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_tenant_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS projects_tenant ON projects (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS log_sources (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id      TEXT        NOT NULL,
  name           TEXT        NOT NULL,
  role           TEXT        NOT NULL CHECK (role IN ('frontend','backend','other')),
  service        TEXT        NOT NULL,
  token_prefix   TEXT        NOT NULL UNIQUE,
  token_hash     BYTEA       NOT NULL,
  provider       TEXT        NOT NULL DEFAULT 'http',
  drain_secret   TEXT,
  last_event_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS log_sources_project ON log_sources (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS log_sources_tenant ON log_sources (tenant_id);

-- Idempotent upgrades for DBs created before provider/drain_secret existed
ALTER TABLE log_sources ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'http';
ALTER TABLE log_sources ADD COLUMN IF NOT EXISTS drain_secret TEXT;

CREATE TABLE IF NOT EXISTS github_connections (
  project_id       UUID        NOT NULL PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id        TEXT        NOT NULL,
  repo             TEXT        NOT NULL,
  installation_id  TEXT,
  webhook_secret   TEXT        NOT NULL,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slack_bindings (
  project_id     UUID        NOT NULL PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  tenant_id      TEXT        NOT NULL,
  team_id        TEXT,
  channel_id     TEXT        NOT NULL,
  channel_name   TEXT,
  bot_token      TEXT        NOT NULL,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function migrate(): Promise<void> {
  const pool = getPool();
  await pool.query(DDL);
  console.log("Migration complete.");
  await closePool();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
