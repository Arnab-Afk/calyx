// Immutable audit log — every proposed, executed, and undone action is recorded.
// In-memory for MVP (replace with DB-backed append-only table in production).

import crypto from "node:crypto";
import type { AuditEntry, ExecutionStatus, ActionResult } from "./types.js";
import type { ApprovalTier } from "../schemas/index.js";

const log: AuditEntry[] = [];

export function propose(opts: {
  tenant_id: string;
  action_name: string;
  params: unknown;
  tier: ApprovalTier;
  triggered_by: string;
  dry_run_result: ActionResult;
}): AuditEntry {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    ...opts,
    status: "proposed",
    proposed_at: new Date().toISOString(),
  };
  log.push(entry);
  return entry;
}

export function recordExecution(
  entryId: string,
  result: ActionResult
): AuditEntry {
  const entry = log.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Audit entry not found: ${entryId}`);
  // Append-only: create a new snapshot-style entry rather than mutating
  const updated: AuditEntry = {
    ...entry,
    status: result.success ? "executed" : "failed",
    execute_result: result,
    executed_at: new Date().toISOString(),
  };
  log.push(updated);
  return updated;
}

export function recordUndo(
  entryId: string,
  result: ActionResult
): AuditEntry {
  const entry = log.find((e) => e.id === entryId);
  if (!entry) throw new Error(`Audit entry not found: ${entryId}`);
  const updated: AuditEntry = {
    ...entry,
    status: "undone",
    undo_result: result,
    undone_at: new Date().toISOString(),
  };
  log.push(updated);
  return updated;
}

export function getAuditLog(tenant_id?: string): AuditEntry[] {
  return tenant_id ? log.filter((e) => e.tenant_id === tenant_id) : [...log];
}

export function clearAuditLog(): void {
  log.length = 0;
}

export function getStatus(entryId: string): ExecutionStatus | undefined {
  // Most recent entry for this id wins (append-only log)
  const entries = log.filter((e) => e.id === entryId);
  return entries[entries.length - 1]?.status;
}
