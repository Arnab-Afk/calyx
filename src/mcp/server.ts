// MCP server — thin adapter over the tool registry.
// Every tool registered in the central registry is automatically exposed here.
// No tool logic lives in this file.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { initAgent, getAllTools, executeTool } from "../agent/index.js";
import type { ToolInput } from "../schemas/index.js";

export function createMcpServer(): Server {
  initAgent();
  const server = new Server(
    { name: "calyx", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // List all registered tools — same set the Slack/CLI adapters use
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputJsonSchema,
    })),
  }));

  // Execute a tool call from a coding agent
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await executeTool(name, (args ?? {}) as ToolInput);

    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }

    const { output } = result;
    return {
      content: [
        {
          type: "text",
          text: output.summary,
        },
        {
          type: "text",
          text: JSON.stringify(output.data, null, 2),
        },
      ],
      isError: false,
    };
  });

  return server;
}

// Entry point when run directly: calyx-mcp-server
export async function startMcpServer(): Promise<void> {
  initAgent();
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate over stdio — don't write anything to stdout here
  process.stderr.write("Calyx MCP server started\n");
}
