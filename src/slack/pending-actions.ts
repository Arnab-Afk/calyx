// Pending Tier-0/blocked-Tier-2 actions waiting for a human to approve via Slack modal.
// Keyed by a short action ID that the Approve button passes back.

import type { ActionResult } from "../execution/types.js";

export interface PendingAction {
  actionId: string;       // random short key, stored in button value
  tenantId: string;
  actionName: string;
  description: string;
  params: unknown;
  channel: string;
  threadTs: string;
  messageTs?: string;     // ts of the "pending approval" Slack message
  triggeredBy: string;    // userId who triggered it
  proposedAt: string;
  dryRunResult: ActionResult;
}

const store = new Map<string, PendingAction>();

export function storePendingAction(action: PendingAction): void {
  store.set(action.actionId, action);
}

export function getPendingAction(actionId: string): PendingAction | undefined {
  return store.get(actionId);
}

export function removePendingAction(actionId: string): void {
  store.delete(actionId);
}

export function generateActionId(): string {
  return Math.random().toString(36).slice(2, 10);
}
