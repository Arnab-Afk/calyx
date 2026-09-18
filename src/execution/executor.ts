// Executor: orchestrates dry-run → policy check → execute → audit for any Action.

import { getActionRegistry } from "./registry.js";
import { decide } from "./policy.js";
import {
  propose,
  recordExecution,
  recordUndo,
} from "./audit-log.js";
import type { AuditEntry } from "./types.js";

export interface ExecuteRequest {
  tenant_id: string;
  action_name: string;
  params: unknown;
  triggered_by: string;
  // If true, skip the policy gate and force execution (for approved-in-Slack flows).
  // The approval UI sets this after a human clicks "Run it."
  human_approved?: boolean;
}

export interface ExecuteResponse {
  entry: AuditEntry;
  executed: boolean;
  message: string;
}

export async function executeAction(
  req: ExecuteRequest
): Promise<ExecuteResponse> {
  const action = getActionRegistry().get(req.action_name);
  if (!action) {
    throw new Error(`Unknown action: ${req.action_name}`);
  }

  // 1. Always dry-run first — this is a hard gate in staging and informative in prod
  const dryRunResult = await action.dry_run(req.params);

  // 2. Record the proposal
  const decision = decide(req.tenant_id, action);
  const entry = propose({
    tenant_id: req.tenant_id,
    action_name: req.action_name,
    params: req.params,
    tier: decision.tier,
    triggered_by: req.triggered_by,
    dry_run_result: dryRunResult,
  });

  // 3. Check if auto-execution is allowed
  const canRun = req.human_approved || decision.canAutoExecute;
  if (!canRun) {
    return {
      entry,
      executed: false,
      message: decision.reason,
    };
  }

  // 4. Execute and record
  const result = await action.execute(req.params);
  const finalEntry = recordExecution(entry.id, result);

  return {
    entry: finalEntry,
    executed: result.success,
    message: result.message,
  };
}

export async function undoAction(
  entryId: string,
  triggeredBy: string
): Promise<ExecuteResponse> {
  const { getAuditLog } = await import("./audit-log.js");
  const entries = getAuditLog();
  const entry = [...entries].reverse().find((e) => e.id === entryId && e.status === "executed");
  if (!entry) throw new Error(`No executed action with id: ${entryId}`);

  const action = getActionRegistry().get(entry.action_name);
  if (!action) throw new Error(`Unknown action: ${entry.action_name}`);
  if (!action.undo) throw new Error(`Action is not reversible: ${entry.action_name}`);

  const result = await action.undo(entry.params);
  const undoEntry = recordUndo(entryId, result);

  return { entry: undoEntry, executed: result.success, message: result.message };
}
