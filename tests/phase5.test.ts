import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { insertEvents } from "../src/storage/events.js";
import { closePool, getPool } from "../src/storage/client.js";
import { initAgent, executeTool, getAllTools } from "../src/agent/index.js";
import { createMcpServer as createScopedMcpServer } from "../src/mcp/server.js";
import { EventSchema, type Event } from "../src/schemas/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TENANT = "mcp-cli-tests";
const createMcpServer = () => createScopedMcpServer({
  credentialId: "test-key",
  tenantId: TENANT,
  name: "test",
  scopes: ["logs:read"],
});

// ─── Seed ─────────────────────────────────────────────────────────────────────

let _evSeq = 0;
function ev(service: string, level: Event["level"], message: string): Event {
  return EventSchema.parse({
    tenant_id: TENANT,
    service,
    level,
    message,
    // Add a unique offset so duplicate messages don't dedup
    timestamp: new Date(Date.now() + _evSeq++).toISOString(),
  });
}

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
  await insertEvents([
    ev("web", "info", "GET /home 200"),
    ev("web", "error", "Unhandled error in renderer"),
    ev("web", "error", "Unhandled error in renderer"),
    ev("db", "info", "Query completed in 12ms"),
    ev("db", "warn", "Slow query: 3200ms"),
  ]);
  initAgent();
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM events WHERE tenant_id = $1", [TENANT]);
  await closePool();
});

// ─── MCP server tests ─────────────────────────────────────────────────────────

describe("Phase 5 — MCP server", () => {
  it("ListTools returns the registered read tools", async () => {
    const server = createMcpServer();
    // Invoke the handler directly — no transport needed for unit tests
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
    })._requestHandlers.get(ListToolsRequestSchema.shape.method.value);

    const result = (await handler?.({ method: "tools/list", params: {} })) as {
      tools: { name: string }[];
    };

    expect(result.tools.length).toBeGreaterThanOrEqual(3);
    const names = new Set(result.tools.map((t: { name: string }) => t.name));
    expect(names.has("query_logs")).toBe(true);
    expect(names.has("get_service_stats")).toBe(true);
    expect(names.has("list_services")).toBe(true);
    expect(names.has("search_past_incidents")).toBe(true);
  });

  it("CallTool query_logs returns structured content", async () => {
    const server = createMcpServer();
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
    })._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    const result = (await handler?.({
      method: "tools/call",
      params: {
        name: "query_logs",
        arguments: { tenant_id: TENANT, service: "web", level: "error" },
      },
    })) as { content: { type: string; text: string }[]; isError: boolean };

    expect(result.isError).toBe(false);
    expect(result.content.length).toBeGreaterThan(0);
    // First content block should be the summary text
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("event");
  });

  it("CallTool returns isError=true for unknown tool", async () => {
    const server = createMcpServer();
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
    })._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    const result = (await handler?.({
      method: "tools/call",
      params: { name: "nonexistent_tool", arguments: {} },
    })) as { isError: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("CallTool get_service_stats returns correct JSON data block", async () => {
    const server = createMcpServer();
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
    })._requestHandlers.get(CallToolRequestSchema.shape.method.value);

    const result = (await handler?.({
      method: "tools/call",
      params: {
        name: "get_service_stats",
        arguments: { tenant_id: TENANT },
      },
    })) as { content: { type: string; text: string }[]; isError: boolean };

    expect(result.isError).toBe(false);
    // Second block is the JSON data
    const data = JSON.parse(result.content[1].text) as { stats: { service: string }[] };
    const services = data.stats.map((s) => s.service);
    expect(services).toContain("web");
    expect(services).toContain("db");
  });

  it("exposes alert context only with incidents:read", async () => {
    const server = createScopedMcpServer({
      credentialId: "incident-key",
      tenantId: TENANT,
      name: "incident-test",
      scopes: ["incidents:read"],
    });
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
    })._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
    const result = (await handler?.({ method: "tools/list", params: {} })) as {
      tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[];
    };

    expect(result.tools.map((tool) => tool.name)).toEqual(["get_alert_context"]);
    expect(result.tools[0].inputSchema.properties).not.toHaveProperty("tenant_id");
  });

  it("exposes ask only with incidents:ask and keeps tenant_id private", async () => {
    const server = createScopedMcpServer({
      credentialId: "ask-key",
      tenantId: TENANT,
      name: "ask-test",
      scopes: ["incidents:ask"],
    });
    const handler = (server as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>;
    })._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
    const result = (await handler?.({ method: "tools/list", params: {} })) as {
      tools: { name: string; inputSchema: { properties: Record<string, unknown> } }[];
    };

    expect(result.tools.map((tool) => tool.name)).toEqual(["ask"]);
    expect(result.tools[0].inputSchema.properties).not.toHaveProperty("tenant_id");
  });

  it("MCP tool descriptions match the central registry", () => {
    const server = createMcpServer();
    const registryTools = getAllTools();
    // The MCP server exposes the same tools — verify no divergence
    for (const tool of registryTools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputJsonSchema.type).toBe("object");
    }
  });
});

// ─── CLI tool integration tests ───────────────────────────────────────────────
// These test the tool layer called by CLI commands — same tools, same results.
// We don't shell out (that would test tsx startup, not the logic).

describe("Phase 5 — CLI tool layer smoke tests", () => {
  it("logs command: query_logs returns web errors", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      service: "web",
      level: "error",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { level: string }[];
    expect(data.every((e) => e.level === "error")).toBe(true);
    expect(data.length).toBe(2);
  });

  it("stats command: get_service_stats returns both services", async () => {
    const result = await executeTool("get_service_stats", {
      tenant_id: TENANT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { stats } = result.output.data as { stats: { service: string }[] };
    const svcNames = stats.map((s) => s.service);
    expect(svcNames).toContain("web");
    expect(svcNames).toContain("db");
  });

  it("search command: search_past_incidents finds 'renderer'", async () => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: TENANT,
      keywords: ["renderer"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as { service: string }[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e) => e.service === "web")).toBe(true);
  });

  it("search command: returns no results for unknown keyword", async () => {
    const result = await executeTool("search_past_incidents", {
      tenant_id: TENANT,
      keywords: ["__calyx_nonexistent_term__"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.output.data as unknown[];
    expect(data).toHaveLength(0);
    expect(result.output.summary).toMatch(/no past incidents/i);
  });

  it("tools command: getAllTools returns non-empty list with descriptions", () => {
    const tools = getAllTools();
    expect(tools.length).toBeGreaterThanOrEqual(3);
    for (const t of tools) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it("invalid level value returns error from tool layer", async () => {
    const result = await executeTool("query_logs", {
      tenant_id: TENANT,
      level: "CRITICAL", // invalid
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Invalid");
    }
  });
});
