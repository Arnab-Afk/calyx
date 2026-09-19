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
