-- Workspace sharing: standard workspaces vs project-scoped guest workspaces.
ALTER TABLE chat_workspaces
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS parent_workspace_id UUID REFERENCES chat_workspaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scoped_project_id TEXT,
  ADD COLUMN IF NOT EXISTS scoped_project_slug TEXT;

CREATE INDEX IF NOT EXISTS chat_workspaces_parent ON chat_workspaces (parent_workspace_id);
CREATE INDEX IF NOT EXISTS chat_workspaces_scoped_project ON chat_workspaces (scoped_project_id);

CREATE TABLE IF NOT EXISTS chat_workspace_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat_workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',
  created_by   UUID NOT NULL REFERENCES chat_users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS chat_workspace_invites_email ON chat_workspace_invites (email);
