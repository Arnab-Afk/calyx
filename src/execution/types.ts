import type { ApprovalTier, Action, ActionResult } from "../schemas/index.js";

export interface TierPolicy {
  tier: ApprovalTier;
  conditions?: string[];
}

export interface ActionPolicy {
  actionName: string;
  tenant_id: string;
  tier: ApprovalTier;
}

export type { Action, ActionResult, ApprovalTier };
