#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { connectorConfig } from "./config.js";

const config = connectorConfig();
const remote = new Client({ name: "calyx-mcp-stdio-bridge", version: "0.1.0" });
const remoteTransport = new StreamableHTTPClientTransport(config.url, {
  requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
});
await remote.connect(remoteTransport);

const local = new Server(
  { name: "calyx-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);
local.setRequestHandler(ListToolsRequestSchema, async () => remote.listTools());
local.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await remote.callTool({
    name: request.params.name,
    arguments: request.params.arguments,
  });
  return {
    content: result.content,
    ...(typeof result.isError === "boolean" && { isError: result.isError }),
  };
});

const stdio = new StdioServerTransport();
await local.connect(stdio);

async function shutdown(): Promise<void> {
  await local.close();
  await remote.close();
}
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
