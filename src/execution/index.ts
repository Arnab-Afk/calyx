import { flagToggleAction } from "./actions/flag-toggle.js";
import { getActionRegistry, registerAction } from "./registry.js";

export function initExecution(): void {
  if (!getActionRegistry().has(flagToggleAction.name))
    registerAction(flagToggleAction);
}

export {
  approveAction,
  getRemediationRequest,
  proposeAction,
  rejectAction,
  undoAction,
} from "./executor.js";
