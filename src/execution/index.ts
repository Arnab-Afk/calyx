import { flagToggleAction } from "./actions/flag-toggle.js";
import { operatorWebhookAction } from "./actions/operator-webhook.js";
import { getActionRegistry, registerAction } from "./registry.js";

export function initExecution(): void {
  if (!getActionRegistry().has(flagToggleAction.name))
    registerAction(flagToggleAction);
  if (!getActionRegistry().has(operatorWebhookAction.name))
    registerAction(operatorWebhookAction);
}

export {
  approveAction,
  getRemediationRequest,
  proposeAction,
  rejectAction,
  undoAction,
} from "./executor.js";
