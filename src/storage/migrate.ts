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
