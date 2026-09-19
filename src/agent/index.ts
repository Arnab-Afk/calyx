import { registerTool } from "./registry.js";
import { askTool } from "./tools/ask.js";
import { queryLogsTool } from "./tools/query_logs.js";
import { getServiceStatsTool } from "./tools/get_service_stats.js";
import { searchPastIncidentsTool } from "./tools/search_past_incidents.js";
import { tailLogsTool } from "./tools/tail_logs.js";
import { getTool } from "./registry.js";

export function initAgent(): void {
  if (!getTool(askTool.name)) registerTool(askTool);
  if (!getTool(queryLogsTool.name)) registerTool(queryLogsTool);
  if (!getTool(getServiceStatsTool.name)) registerTool(getServiceStatsTool);
  if (!getTool(searchPastIncidentsTool.name)) registerTool(searchPastIncidentsTool);
  if (!getTool(tailLogsTool.name)) registerTool(tailLogsTool);
}

export { runAgent, agentProvider } from "./loop.js";
export type { AgentProvider, AgentRunOptions } from "./loop.js";
export { getAllTools, getTool, executeTool } from "./registry.js";
