import { registerTool } from "./registry.js";
import { askTool } from "./tools/ask.js";
import { queryLogsTool } from "./tools/query_logs.js";
import { getServiceStatsTool } from "./tools/get_service_stats.js";
import { getAlertContextTool } from "./tools/get_alert_context.js";
import { getChangeContextTool } from "./tools/get_change_context.js";
import { getIncidentTool } from "./tools/get_incident.js";
import { listIncidentsTool } from "./tools/list_incidents.js";
import { listServicesTool } from "./tools/list_services.js";
import { searchPastIncidentsTool } from "./tools/search_past_incidents.js";
import { searchIncidentsTool } from "./tools/search_incidents.js";
import { tailLogsTool } from "./tools/tail_logs.js";
import { proposeRemediationTool } from "./tools/propose_remediation.js";
import { getTool } from "./registry.js";
import { initExecution } from "../execution/index.js";

export function initAgent(): void {
  initExecution();
  if (!getTool(askTool.name)) registerTool(askTool);
  if (!getTool(queryLogsTool.name)) registerTool(queryLogsTool);
  if (!getTool(getServiceStatsTool.name)) registerTool(getServiceStatsTool);
  if (!getTool(getAlertContextTool.name)) registerTool(getAlertContextTool);
  if (!getTool(getChangeContextTool.name)) registerTool(getChangeContextTool);
  if (!getTool(getIncidentTool.name)) registerTool(getIncidentTool);
  if (!getTool(listIncidentsTool.name)) registerTool(listIncidentsTool);
  if (!getTool(listServicesTool.name)) registerTool(listServicesTool);
  if (!getTool(searchPastIncidentsTool.name))
    registerTool(searchPastIncidentsTool);
  if (!getTool(searchIncidentsTool.name)) registerTool(searchIncidentsTool);
  if (!getTool(tailLogsTool.name)) registerTool(tailLogsTool);
  if (!getTool(proposeRemediationTool.name))
    registerTool(proposeRemediationTool);
}

export { runAgent, agentProvider } from "./loop.js";
export type { AgentProvider, AgentRunOptions } from "./loop.js";
export { getAllTools, getTool, executeTool } from "./registry.js";
