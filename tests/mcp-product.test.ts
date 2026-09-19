import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApiKey, authenticateApiKey, revokeApiKey } from "../src/mcp/auth.js";
import { createMcpHttpServer } from "../src/mcp/http-server.js";
import { executeTool, initAgent } from "../src/agent/index.js";
import { insertEvents } from "../src/storage/events.js";
import { EventSchema } from "../src/schemas/index.js";
import { closePool, getPool } from "../src/storage/client.js";
import { consumeAnonymousMcpRateLimit, consumeMcpRateLimit } from "../src/mcp/rate-limit.js";

const TENANT = "mcp-product-tests";
const OTHER_TENANT = "mcp-product-tests-other";

beforeAll(async () => {
  await getPool().query("DELETE FROM events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM audit_events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_api_keys WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_anonymous_rate_limits WHERE identifier LIKE 'test-%'");
  await getPool().query("DELETE FROM mcp_oauth_rate_limits WHERE subject LIKE 'oauth:%'");
  initAgent();
});

afterAll(async () => {
  await getPool().query("DELETE FROM events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM audit_events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_api_keys WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_anonymous_rate_limits WHERE identifier LIKE 'test-%'");
  await getPool().query("DELETE FROM mcp_oauth_rate_limits WHERE subject LIKE 'oauth:%'");
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

  it("enforces a shared credential rate limit and audits credential lifecycle", async () => {
    const created = await createApiKey({ tenantId: TENANT, name: "Rate test", scopes: ["logs:read"] });
    const anonymousId = `test-${crypto.randomUUID()}`;
    expect((await consumeAnonymousMcpRateLimit(anonymousId, 1)).allowed).toBe(true);
    expect((await consumeAnonymousMcpRateLimit(anonymousId, 1)).allowed).toBe(false);
    expect((await consumeMcpRateLimit(created.credentialId, 2)).allowed).toBe(true);
    expect((await consumeMcpRateLimit(created.credentialId, 2)).allowed).toBe(true);
    const limited = await consumeMcpRateLimit(created.credentialId, 2);
    expect(limited).toMatchObject({ allowed: false, limit: 2, remaining: 0 });

    expect(await revokeApiKey(created.credentialId, TENANT)).toBe(true);
    const audit = await getPool().query(
      `SELECT action, success FROM audit_events
       WHERE tenant_id = $1 AND resource_id = $2 ORDER BY created_at ASC`,
      [TENANT, created.credentialId]
    );
    expect(audit.rows).toEqual([
      { action: "mcp.credential_created", success: true },
      { action: "mcp.credential_revoked", success: true },
    ]);
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

  it("accepts externally issued OAuth tokens and publishes protected-resource metadata", async () => {
    const issuer = createServer(async (req, res) => {
      for await (const _chunk of req) { /* consume form body */ }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        active: true,
        sub: "user-123",
        tenant_id: TENANT,
        scope: "logs:read incidents:read",
        aud: process.env.MCP_PUBLIC_URL,
        exp: Math.floor(Date.now() / 1000) + 300,
      }));
    });
    await new Promise<void>((resolve) => issuer.listen(0, "127.0.0.1", resolve));
    const issuerPort = (issuer.address() as AddressInfo).port;
    process.env.MCP_OAUTH_ISSUER = `http://127.0.0.1:${issuerPort}`;
    process.env.MCP_OAUTH_INTROSPECTION_URL = `http://127.0.0.1:${issuerPort}/introspect`;
    process.env.MCP_OAUTH_CLIENT_ID = "calyx-test";
    process.env.MCP_OAUTH_CLIENT_SECRET = "test-secret";

    const httpServer = createMcpHttpServer();
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    const port = (httpServer.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}/mcp`;
    process.env.MCP_PUBLIC_URL = endpoint;
    try {
      const metadata = await fetch(
        `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`
      );
      expect(metadata.status).toBe(200);
      expect(await metadata.json()).toMatchObject({
        resource: endpoint,
        authorization_servers: [process.env.MCP_OAUTH_ISSUER],
      });

      const client = new Client({ name: "oauth-vitest", version: "1.0.0" });
      const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: { headers: { Authorization: "Bearer external-oauth-token" } },
      });
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("list_services");
      expect(tools.tools.map((tool) => tool.name)).not.toContain("ask");
      await client.close();
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await new Promise<void>((resolve) => issuer.close(() => resolve()));
      delete process.env.MCP_OAUTH_ISSUER;
      delete process.env.MCP_OAUTH_INTROSPECTION_URL;
      delete process.env.MCP_OAUTH_CLIENT_ID;
      delete process.env.MCP_OAUTH_CLIENT_SECRET;
      delete process.env.MCP_PUBLIC_URL;
    }
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
      expect(unauthorized.headers.get("x-ratelimit-limit")).toBe("30");

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

      const audit = await getPool().query(
        `SELECT action, resource_id, metadata FROM audit_events
         WHERE tenant_id = $1 AND actor_id = $2 ORDER BY created_at ASC`,
        [TENANT, created.credentialId]
      );
      expect(audit.rows.some((row) => row.action === "mcp.request")).toBe(true);
      expect(
        audit.rows.some(
          (row) => row.action === "mcp.tool_call" && row.resource_id === "query_logs"
        )
      ).toBe(true);
      expect(JSON.stringify(audit.rows)).not.toContain(OTHER_TENANT);
    } finally {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
