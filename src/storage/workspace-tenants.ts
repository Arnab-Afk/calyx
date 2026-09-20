import { recordAuditEvent } from "./audit.js";
import { getPool } from "./client.js";

export async function linkWorkspaceToTenant(
  workspaceId: string,
  tenantId: string
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO workspace_tenant_links (workspace_id, tenant_id)
       VALUES ($1, $2)
       ON CONFLICT (workspace_id) DO UPDATE
         SET updated_at = NOW()
         WHERE workspace_tenant_links.tenant_id = EXCLUDED.tenant_id
       RETURNING tenant_id`,
      [workspaceId, tenantId]
    );
    if (result.rowCount !== 1) {
      throw new Error("Workspace is already linked to a different tenant");
    }
    await recordAuditEvent(
      {
        tenantId,
        actorType: "operator",
        action: "workspace.tenant_linked",
        resourceType: "workspace",
        resourceId: workspaceId,
        success: true,
      },
      client
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function tenantForWorkspace(workspaceId: string): Promise<string | null> {
  const result = await getPool().query(
    "SELECT tenant_id FROM workspace_tenant_links WHERE workspace_id = $1",
    [workspaceId]
  );
  return result.rows[0]?.tenant_id ?? null;
}

export async function workspacesForTenant(tenantId: string): Promise<string[]> {
  const result = await getPool().query(
    `SELECT workspace_id FROM workspace_tenant_links WHERE tenant_id = $1 ORDER BY workspace_id`,
    [tenantId],
  );
  return result.rows.map((row) => String(row.workspace_id));
}

export type WorkspaceProjectScope = {
  workspaceId: string;
  tenantId: string;
  projectId: string;
  projectSlug: string;
  hostWorkspaceId: string;
};

export async function setWorkspaceProjectScope(input: {
  workspaceId: string;
  tenantId: string;
  projectId: string;
  projectSlug: string;
  hostWorkspaceId: string;
}): Promise<WorkspaceProjectScope> {
  const result = await getPool().query(
    `INSERT INTO workspace_project_scopes
       (workspace_id, tenant_id, project_id, project_slug, host_workspace_id)
     VALUES ($1, $2, $3::uuid, $4, $5)
     ON CONFLICT (workspace_id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       project_id = EXCLUDED.project_id,
       project_slug = EXCLUDED.project_slug,
       host_workspace_id = EXCLUDED.host_workspace_id
     RETURNING *`,
    [input.workspaceId, input.tenantId, input.projectId, input.projectSlug, input.hostWorkspaceId],
  );
  const row = result.rows[0];
  return {
    workspaceId: row.workspace_id,
    tenantId: row.tenant_id,
    projectId: String(row.project_id),
    projectSlug: row.project_slug,
    hostWorkspaceId: row.host_workspace_id,
  };
}

export async function projectScopeForWorkspace(
  workspaceId: string,
): Promise<WorkspaceProjectScope | null> {
  const result = await getPool().query(
    `SELECT * FROM workspace_project_scopes WHERE workspace_id = $1`,
    [workspaceId],
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    workspaceId: row.workspace_id,
    tenantId: row.tenant_id,
    projectId: String(row.project_id),
    projectSlug: row.project_slug,
    hostWorkspaceId: row.host_workspace_id,
  };
}
