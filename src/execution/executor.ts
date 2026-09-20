import { getActionRegistry } from "./registry.js";
import { decide } from "./policy.js";
import {
  claimApprovedRemediation,
  claimUndo,
  completeRemediation,
  completeUndo,
  createRemediationRequest,
  getRemediationRequest,
  rejectRemediation,
  type RemediationRequest,
} from "../storage/remediations.js";

export interface ProposeActionRequest {
  tenantId: string;
  actionName: string;
  params: unknown;
  proposedBy: string;
}

export interface ActionTransitionResponse {
  request: RemediationRequest;
  executed: boolean;
  message: string;
}

export async function proposeAction(
  input: ProposeActionRequest,
): Promise<ActionTransitionResponse> {
  const action = getActionRegistry().get(input.actionName);
  if (!action) throw new Error(`Unknown action: ${input.actionName}`);

  const dryRunResult = await action.dry_run(input.params);
  const decision = decide(input.tenantId, action);
  const request = await createRemediationRequest({
    tenantId: input.tenantId,
    actionName: action.name,
    params: input.params,
    tier: decision.tier,
    reversible: action.reversible,
    proposedBy: input.proposedBy,
    dryRunResult,
    initialStatus: dryRunResult.success ? "pending" : "failed",
  });

  return {
    request,
    executed: false,
    message: dryRunResult.success
      ? "Remediation is waiting for explicit human approval."
      : `Dry run failed; remediation cannot be approved: ${dryRunResult.message}`,
  };
}

export async function approveAction(input: {
  requestId: string;
  approvedBy: string;
  reason: string;
}): Promise<ActionTransitionResponse> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Approval reason is required");

  const request = await claimApprovedRemediation(
    input.requestId,
    input.approvedBy,
    reason,
  );
  if (!request)
    throw new Error(`Remediation request is not pending: ${input.requestId}`);

  const action = getActionRegistry().get(request.actionName);
  if (!action) {
    const failed = await completeRemediation(request.id, input.approvedBy, {
      success: false,
      message: `Action is no longer registered: ${request.actionName}`,
    });
    return {
      request: failed,
      executed: false,
      message: failed.executeResult!.message,
    };
  }

  let result;
  try {
    result = await action.execute(request.params);
  } catch (error) {
    result = {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const completed = await completeRemediation(
    request.id,
    input.approvedBy,
    result,
  );
  return {
    request: completed,
    executed: result.success,
    message: result.message,
  };
}

export async function rejectAction(input: {
  requestId: string;
  rejectedBy: string;
  reason: string;
}): Promise<RemediationRequest> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Rejection reason is required");
  const request = await rejectRemediation(
    input.requestId,
    input.rejectedBy,
    reason,
  );
  if (!request)
    throw new Error(`Remediation request is not pending: ${input.requestId}`);
  return request;
}

export async function undoAction(input: {
  requestId: string;
  triggeredBy: string;
  reason: string;
}): Promise<ActionTransitionResponse> {
  const reason = input.reason.trim();
  if (!reason) throw new Error("Undo reason is required");
  const request = await claimUndo(input.requestId, input.triggeredBy, reason);
  if (!request)
    throw new Error(
      `Executed reversible remediation not found: ${input.requestId}`,
    );

  const action = getActionRegistry().get(request.actionName);
  if (!action?.undo) {
    const failed = await completeUndo(request.id, input.triggeredBy, {
      success: false,
      message: `Action is not reversible: ${request.actionName}`,
    });
    return {
      request: failed,
      executed: false,
      message: failed.undoResult!.message,
    };
  }

  let result;
  try {
    result = await action.undo(request.params, request.executeResult);
  } catch (error) {
    result = {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const completed = await completeUndo(request.id, input.triggeredBy, result);
  return {
    request: completed,
    executed: result.success,
    message: result.message,
  };
}

export { getRemediationRequest };
