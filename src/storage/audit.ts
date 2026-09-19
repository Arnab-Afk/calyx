import type pg from "pg";
import { getPool } from "./client.js";

export interface AuditEventInput {
  tenantId?: string;
  actorType: "mcp_credential" | "operator" | "slack_user" | "system";
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  success: boolean;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAuditEvent(
  event: AuditEventInput,
  database: Pick<pg.Pool, "query"> | pg.PoolClient = getPool()
): Promise<void> {
  await database.query(
    `INSERT INTO audit_events
       (tenant_id, actor_type, actor_id, action, resource_type, resource_id,
        success, metadata, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      event.tenantId ?? null,
      event.actorType,
      event.actorId ?? null,
      event.action,
      event.resourceType ?? null,
      event.resourceId ?? null,
      event.success,
      event.metadata ?? {},
      event.ipAddress ?? null,
      event.userAgent?.slice(0, 1000) ?? null,
    ]
  );
}
