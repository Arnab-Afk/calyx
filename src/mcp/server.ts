// MCP adapter over the central Calyx tool registry.
// A server is always bound to one authenticated tenant; callers cannot select tenants.

import "dotenv/config";
import { pathToFileURL } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { initAgent, getAllTools, executeTool } from "../agent/index.js";
import type { ToolInput, ToolJsonSchema } from "../schemas/index.js";
import { authenticateApiKey, type McpPrincipal, type McpScope } from "./auth.js";

export interface McpContext extends McpPrincipal {}

const TOOL_SCOPES: Record<string, McpScope> = {
  ask: "incidents:ask",
  query_logs: "logs:read",
  get_service_stats: "logs:read",
  search_past_incidents: "logs:read",
  tail_logs: "logs:read",
};

function publicInputSchema(schema: ToolJsonSchema): ToolJsonSchema {
  const { tenant_id: _tenantId, ...properties } = schema.properties;
  const required = schema.required?.filter((name) => name !== "tenant_id");
  return {
    ...schema,
    properties,
    ...(required?.length ? { required } : { required: [] }),
  };
}

function canUseTool(context: McpContext, toolName: string): boolean {
  const required = TOOL_SCOPES[toolName];
  return required !== undefined && context.scopes.includes(required);
}

export function createMcpServer(context: McpContext): Server {
  initAgent();
  const server = new Server(
    { name: "calyx", version: "0.2.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Use Calyx to inspect production evidence for the authenticated tenant. Start with service health or recent logs. Use tail_logs repeatedly with next_cursor to follow live events. Never state a root cause without evidence.",
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getAllTools()
      .filter((tool) => canUseTool(context, tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: publicInputSchema(tool.inputJsonSchema),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const requiredScope = TOOL_SCOPES[name];
    if (!requiredScope) {
      return {
        content: [{ type: "text", text: `Error: unknown or unavailable tool: ${name}` }],
        isError: true,
      };
    }
    if (!context.scopes.includes(requiredScope)) {
      return {
        content: [{ type: "text", text: `Forbidden: missing ${requiredScope} scope` }],
        isError: true,
      };
    }

    const input = { ...(args ?? {}), tenant_id: context.tenantId } as ToolInput;
    const result = await executeTool(name, input);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}` }],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text", text: result.output.summary },
        { type: "text", text: JSON.stringify(result.output.data, null, 2) },
      ],
      structuredContent: { data: result.output.data },
      isError: false,
    };
  });

  return server;
}

async function localContext(): Promise<McpContext> {
  const apiKey = process.env.CALYX_API_KEY;
  if (apiKey) {
    const principal = await authenticateApiKey(apiKey);
    if (!principal) throw new Error("CALYX_API_KEY is invalid, expired, or revoked");
    return principal;
  }

  const tenantId = process.env.CALYX_TENANT_ID;
  if (!tenantId) {
    throw new Error("Set CALYX_TENANT_ID for local stdio, or CALYX_API_KEY for authenticated access");
  }
  const scopes = (process.env.CALYX_MCP_SCOPES ?? "logs:read,incidents:read,incidents:ask")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean) as McpScope[];
  return { credentialId: "local-stdio", tenantId, name: "local-stdio", scopes };
}

export async function startMcpServer(): Promise<void> {
  const context = await localContext();
  const server = createMcpServer(context);
  await server.connect(new StdioServerTransport());
  process.stderr.write(`Calyx MCP stdio server started for tenant ${context.tenantId}\n`);
}

const isEntryPoint = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isEntryPoint) {
  startMcpServer().catch((error) => {
    process.stderr.write(`Failed to start Calyx MCP: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
