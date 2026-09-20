import type { PoolClient } from "pg";
import type { ActionResult, ApprovalTier } from "../execution/types.js";
import { getPool } from "./client.js";

export type RemediationStatus =
  | "pending"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "undoing"
  | "undone";

export interface RemediationRequest {
  id: string;
  tenantId: string;
  actionName: string;
  params: unknown;
  tier: ApprovalTier;
  reversible: boolean;
  status: RemediationStatus;
  proposedBy: string;
  dryRunResult: ActionResult;
  executeResult?: ActionResult;
  undoResult?: ActionResult;
  approvedBy?: string;
  approvalReason?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: string;
  decidedAt?: string;
  executedAt?: string;
  undoneAt?: string;
}

interface RequestRow {
  id: string;
  tenant_id: string;
  action_name: string;
  params: unknown;
  tier: ApprovalTier;
  reversible: boolean;
  status: RemediationStatus;
  proposed_by: string;
  dry_run_result: ActionResult;
  execute_result: ActionResult | null;
  undo_result: ActionResult | null;
  approved_by: string | null;
  approval_reason: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: Date;
  decided_at: Date | null;
  executed_at: Date | null;
  undone_at: Date | null;
}

function mapRequest(row: RequestRow): RemediationRequest {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actionName: row.action_name,
    params: row.params,
    tier: row.tier,
    reversible: row.reversible,
    status: row.status,
    proposedBy: row.proposed_by,
    dryRunResult: row.dry_run_result,
    ...(row.execute_result && { executeResult: row.execute_result }),
    ...(row.undo_result && { undoResult: row.undo_result }),
    ...(row.approved_by && { approvedBy: row.approved_by }),
    ...(row.approval_reason && { approvalReason: row.approval_reason }),
    ...(row.rejected_by && { rejectedBy: row.rejected_by }),
    ...(row.rejection_reason && { rejectionReason: row.rejection_reason }),
    createdAt: row.created_at.toISOString(),
    ...(row.decided_at && { decidedAt: row.decided_at.toISOString() }),
    ...(row.executed_at && { executedAt: row.executed_at.toISOString() }),
    ...(row.undone_at && { undoneAt: row.undone_at.toISOString() }),
  };
}

const columns = `id, tenant_id, action_name, params, tier, reversible, status, proposed_by,
  dry_run_result, execute_result, undo_result, approved_by, approval_reason,
  rejected_by, rejection_reason, created_at, decided_at, executed_at, undone_at`;

async function appendEvent(
  client: PoolClient,
  input: {
    requestId: string;
    tenantId: string;
    eventType: string;
    actorId: string;
    reason?: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO remediation_events (request_id, tenant_id, event_type, actor_id, reason, data)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      input.requestId,
      input.tenantId,
      input.eventType,
      input.actorId,
      input.reason ?? null,
      input.data ?? {},
    ],
  );
}

export async function createRemediationRequest(input: {
  tenantId: string;
  actionName: string;
  params: unknown;
  tier: ApprovalTier;
  reversible: boolean;
  proposedBy: string;
  dryRunResult: ActionResult;
  initialStatus?: "pending" | "failed";
}): Promise<RemediationRequest> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<RequestRow>(
      `INSERT INTO remediation_requests
         (tenant_id, action_name, params, tier, reversible, status, proposed_by, dry_run_result)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING ${columns}`,
      [
        input.tenantId,
        input.actionName,
        input.params,
        input.tier,
        input.reversible,
        input.initialStatus ?? "pending",
        input.proposedBy,
        input.dryRunResult,
      ],
    );
    const request = mapRequest(result.rows[0]);
    await appendEvent(client, {
      requestId: request.id,
      tenantId: request.tenantId,
      eventType: "proposed",
      actorId: input.proposedBy,
      data: { tier: input.tier, dryRunResult: input.dryRunResult },
    });
    if (request.status === "failed") {
      await appendEvent(client, {
        requestId: request.id,
        tenantId: request.tenantId,
        eventType: "failed",
        actorId: input.proposedBy,
        data: { stage: "dry_run", result: input.dryRunResult },
      });
    }
    await client.query("COMMIT");
    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getRemediationRequest(
  id: string,
  tenantId?: string,
): Promise<RemediationRequest | null> {
  const params: unknown[] = [id];
  const tenantClause = tenantId
    ? ` AND tenant_id = $${params.push(tenantId)}`
    : "";
  const result = await getPool().query<RequestRow>(
    `SELECT ${columns} FROM remediation_requests WHERE id = $1${tenantClause}`,
    params,
  );
  return result.rows[0] ? mapRequest(result.rows[0]) : null;
}

export async function claimApprovedRemediation(
  id: string,
  approvedBy: string,
  reason: string,
): Promise<RemediationRequest | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<RequestRow>(
      `UPDATE remediation_requests
       SET status='executing', approved_by=$2, approval_reason=$3, decided_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='pending'
       RETURNING ${columns}`,
      [id, approvedBy, reason],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const request = mapRequest(result.rows[0]);
    await appendEvent(client, {
      requestId: id,
      tenantId: request.tenantId,
      eventType: "approved",
      actorId: approvedBy,
      reason,
    });
    await appendEvent(client, {
      requestId: id,
      tenantId: request.tenantId,
      eventType: "execution_started",
      actorId: approvedBy,
    });
    await client.query("COMMIT");
    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeRemediation(
  id: string,
  actorId: string,
  result: ActionResult,
): Promise<RemediationRequest> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const status = result.success ? "executed" : "failed";
    const updated = await client.query<RequestRow>(
      `UPDATE remediation_requests SET status=$2, execute_result=$3, executed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='executing' RETURNING ${columns}`,
      [id, status, result],
    );
    if (!updated.rows[0])
      throw new Error(`Remediation request is not executing: ${id}`);
    const request = mapRequest(updated.rows[0]);
    await appendEvent(client, {
      requestId: id,
      tenantId: request.tenantId,
      eventType: status,
      actorId,
      data: { result },
    });
    await client.query("COMMIT");
    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejectRemediation(
  id: string,
  rejectedBy: string,
  reason: string,
): Promise<RemediationRequest | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<RequestRow>(
      `UPDATE remediation_requests
       SET status='rejected', rejected_by=$2, rejection_reason=$3, decided_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='pending' RETURNING ${columns}`,
      [id, rejectedBy, reason],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const request = mapRequest(result.rows[0]);
    await appendEvent(client, {
      requestId: id,
      tenantId: request.tenantId,
      eventType: "rejected",
      actorId: rejectedBy,
      reason,
    });
    await client.query("COMMIT");
    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function claimUndo(
  id: string,
  actorId: string,
  reason: string,
): Promise<RemediationRequest | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<RequestRow>(
      `UPDATE remediation_requests SET status='undoing', updated_at=NOW()
       WHERE id=$1 AND status='executed' AND reversible=TRUE RETURNING ${columns}`,
      [id],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const request = mapRequest(result.rows[0]);
    await appendEvent(client, {
      requestId: id,
      tenantId: request.tenantId,
      eventType: "undo_started",
      actorId,
      reason,
    });
    await client.query("COMMIT");
    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeUndo(
  id: string,
  actorId: string,
  result: ActionResult,
): Promise<RemediationRequest> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const status = result.success ? "undone" : "failed";
    const updated = await client.query<RequestRow>(
      `UPDATE remediation_requests SET status=$2, undo_result=$3, undone_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='undoing' RETURNING ${columns}`,
      [id, status, result],
    );
    if (!updated.rows[0])
      throw new Error(`Remediation request is not undoing: ${id}`);
    const request = mapRequest(updated.rows[0]);
    await appendEvent(client, {
      requestId: id,
      tenantId: request.tenantId,
      eventType: status === "undone" ? "undone" : "failed",
      actorId,
      data: { result, operation: "undo" },
    });
    await client.query("COMMIT");
    return request;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
