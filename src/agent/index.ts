import { registerTool } from "./registry.js";
import { queryLogsTool } from "./tools/query_logs.js";
import { getServiceStatsTool } from "./tools/get_service_stats.js";
import { searchPastIncidentsTool } from "./tools/search_past_incidents.js";

export function initAgent(): void {
  registerTool(queryLogsTool);
  registerTool(getServiceStatsTool);
  registerTool(searchPastIncidentsTool);
}

export { runAgent, agentProvider } from "./loop.js";
export type { AgentProvider, AgentRunOptions } from "./loop.js";
export { getAllTools, getTool, executeTool } from "./registry.js";
