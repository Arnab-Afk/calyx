import type { ApprovalTier, Action, ActionResult } from "../schemas/index.js";

// ─── Policy ───────────────────────────────────────────────────────────────────

export interface TierPolicy {
  tier: ApprovalTier;
  // For Tier 1/2: conditions under which auto-execution is allowed
  conditions?: string[];
}

// Tenant-level override for a specific action type
export interface ActionPolicy {
  actionName: string;
  tenant_id: string;
  tier: ApprovalTier;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export type ExecutionStatus = "proposed" | "approved" | "executed" | "failed" | "undone";

export interface AuditEntry {
  id: string;
  tenant_id: string;
  action_name: string;
  params: unknown;
  tier: ApprovalTier;
  status: ExecutionStatus;
  triggered_by: string;      // user ID, agent, or scheduled-job ID
  dry_run_result?: ActionResult;
  execute_result?: ActionResult;
  undo_result?: ActionResult;
  proposed_at: string;
  executed_at?: string;
  undone_at?: string;
}

export type { Action, ActionResult, ApprovalTier };
