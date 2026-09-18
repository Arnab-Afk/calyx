// Approval-tier policy layer — sits in front of every action execution.
// Tier logic is driven by config, not hardcoded per action.

import type { ApprovalTier, Action } from "./types.js";

// In-memory policy overrides (loaded from tenant config at startup in production)
const overrides = new Map<string, ApprovalTier>(); // key: `${tenant_id}:${actionName}`

export function setTierOverride(
  tenant_id: string,
  actionName: string,
  tier: ApprovalTier
): void {
  overrides.set(`${tenant_id}:${actionName}`, tier);
}

export function clearTierOverrides(): void {
  overrides.clear();
}

export function resolvedTier(
  tenant_id: string,
  action: Action
): ApprovalTier {
  return overrides.get(`${tenant_id}:${action.name}`) ?? action.defaultTier;
}

export interface ExecuteDecision {
  canAutoExecute: boolean;
  reason: string;
  tier: ApprovalTier;
}

// Decide whether an action can run automatically or needs a human click.
export function decide(
  tenant_id: string,
  action: Action
): ExecuteDecision {
  const tier = resolvedTier(tenant_id, action);

  if (tier === "0") {
    return {
      canAutoExecute: false,
      reason: "Tier 0: suggest-only — requires human approval before executing.",
      tier,
    };
  }

  if (tier === "1") {
    return {
      canAutoExecute: true,
      reason: "Tier 1: pre-approved playbook — auto-executing.",
      tier,
    };
  }

  if (tier === "2") {
    return {
      canAutoExecute: action.reversible,
      reason: action.reversible
        ? "Tier 2: bounded autonomy — executing (action is reversible)."
        : "Tier 2: bounded autonomy — blocked because action is NOT reversible.",
      tier,
    };
  }

  return { canAutoExecute: false, reason: "Unknown tier.", tier };
}
