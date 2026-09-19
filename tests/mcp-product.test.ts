import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApiKey, authenticateApiKey, revokeApiKey } from "../src/mcp/auth.js";
import { createMcpHttpServer } from "../src/mcp/http-server.js";
import { executeTool, initAgent } from "../src/agent/index.js";
import { insertEvents } from "../src/storage/events.js";
import { EventSchema } from "../src/schemas/index.js";
import { closePool, getPool } from "../src/storage/client.js";

const TENANT = "mcp-product-tests";
const OTHER_TENANT = "mcp-product-tests-other";

beforeAll(async () => {
  await getPool().query("DELETE FROM events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_api_keys WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  initAgent();
});

afterAll(async () => {
  await getPool().query("DELETE FROM events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_api_keys WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await closePool();
});

describe("MCP product connector", () => {
  it("creates hashed credentials, authenticates them, and rejects revoked credentials", async () => {
    const created = await createApiKey({ tenantId: TENANT, name: "Claude Code", scopes: ["logs:read"] });
    expect(created.token).toMatch(/^calyx_sk_/);

    const stored = await getPool().query("SELECT token_hash FROM mcp_api_keys WHERE id = $1", [created.credentialId]);
    expect(stored.rows[0].token_hash.toString()).not.toContain(created.token);
    expect((await authenticateApiKey(created.token))?.tenantId).toBe(TENANT);

    expect(await revokeApiKey(created.credentialId, TENANT)).toBe(true);
    expect(await authenticateApiKey(created.token)).toBeNull();
  });

  it("tails only events ingested after its opaque cursor", async () => {
    const first = await executeTool("tail_logs", { tenant_id: TENANT, wait_ms: 0 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const cursor = (first.output.data as { next_cursor: string }).next_cursor;

    await insertEvents([
      EventSchema.parse({
        tenant_id: TENANT,
        timestamp: new Date().toISOString(),
        service: "checkout",
        level: "error",
        message: "live MCP event",
      }),
      EventSchema.parse({
        tenant_id: OTHER_TENANT,
        timestamp: new Date(Date.now() + 1).toISOString(),
        service: "private-service",
        level: "error",
        message: "must not leak",
      }),
    ]);

    const next = await executeTool("tail_logs", { tenant_id: TENANT, cursor, wait_ms: 0 });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const events = (next.output.data as { events: { message: string; tenant_id: string }[] }).events;
    expect(events.map((event) => event.message)).toContain("live MCP event");
    expect(events.every((event) => event.tenant_id === TENANT)).toBe(true);
  });

  it("serves scoped tools over authenticated Streamable HTTP", async () => {
    const created = await createApiKey({ tenantId: TENANT, name: "Codex", scopes: ["logs:read"] });
    const httpServer = createMcpHttpServer();
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}/mcp`;

    try {
      const unauthorized = await fetch(endpoint, { method: "POST", body: "{}" });
      expect(unauthorized.status).toBe(401);

      const client = new Client({ name: "vitest", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${created.token}` } },
      });
      await client.connect(transport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("tail_logs");
      expect(tools.tools.every((tool) => !("tenant_id" in (tool.inputSchema.properties ?? {})))).toBe(true);

      const result = await client.callTool({
        name: "query_logs",
        arguments: { tenant_id: OTHER_TENANT, limit: 100 },
      });
      const content = result.content as Array<{ type: string; text?: string }>;
      const text = content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n");
      expect(text).toContain("live MCP event");
      expect(text).not.toContain("must not leak");
      await client.close();
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
