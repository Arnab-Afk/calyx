package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 20
	cfg.MinConns = 2
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}
	return pool, nil
}

const schemaSQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS chat_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  image         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  join_code  TEXT NOT NULL,
  owner_id   UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_workspaces_owner ON chat_workspaces (owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS chat_workspaces_join_code ON chat_workspaces (join_code);

CREATE TABLE IF NOT EXISTS chat_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES chat_workspaces(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members (user_id);
CREATE INDEX IF NOT EXISTS chat_members_workspace ON chat_members (workspace_id);

CREATE TABLE IF NOT EXISTS chat_channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES chat_workspaces(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS chat_channels_workspace ON chat_channels (workspace_id);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES chat_workspaces(id) ON DELETE CASCADE,
  member_one_id UUID NOT NULL REFERENCES chat_members(id) ON DELETE CASCADE,
  member_two_id UUID NOT NULL REFERENCES chat_members(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_conversations_workspace ON chat_conversations (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_pair
  ON chat_conversations (
    workspace_id,
    LEAST(member_one_id, member_two_id),
    GREATEST(member_one_id, member_two_id)
  );

CREATE TABLE IF NOT EXISTS chat_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body               TEXT NOT NULL,
  member_id          UUID NOT NULL REFERENCES chat_members(id) ON DELETE CASCADE,
  workspace_id       UUID NOT NULL REFERENCES chat_workspaces(id) ON DELETE CASCADE,
  channel_id         UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  parent_message_id  UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id    UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  image_url          TEXT,
  calyx_data         JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chat_messages_channel_time ON chat_messages (channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_parent ON chat_messages (parent_message_id);
CREATE INDEX IF NOT EXISTS chat_messages_workspace ON chat_messages (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat_workspaces(id) ON DELETE CASCADE,
  message_id   UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES chat_members(id) ON DELETE CASCADE,
  value        TEXT NOT NULL,
  UNIQUE (message_id, member_id, value)
);
CREATE INDEX IF NOT EXISTS chat_reactions_message ON chat_reactions (message_id);
`

func Migrate(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, schemaSQL)
	return err
}
