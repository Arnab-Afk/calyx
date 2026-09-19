import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { mcpCredentialsRoute } from "../src/ingestion/routes/v1/mcp-credentials.js";
import { closePool, getPool } from "../src/storage/client.js";
import { linkWorkspaceToTenant } from "../src/storage/workspace-tenants.js";

const TENANT = "mcp-route-tests";
const OTHER_TENANT = "mcp-route-tests-other";
const WORKSPACE = "convex-workspace-a";
const OTHER_WORKSPACE = "convex-workspace-b";
const INTERNAL_KEY = "test-internal-key-with-more-than-32-bytes";

const app = Fastify();

beforeAll(async () => {
  process.env.CALYX_INTERNAL_API_KEY = INTERNAL_KEY;
  await app.register(mcpCredentialsRoute);
  await app.ready();
  await getPool().query("DELETE FROM audit_events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_api_keys WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query(
    `INSERT INTO workspace_tenant_links (workspace_id, tenant_id) VALUES ($1, $2), ($3, $4)
     ON CONFLICT (workspace_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id`,
    [WORKSPACE, TENANT, OTHER_WORKSPACE, OTHER_TENANT]
  );
});

afterAll(async () => {
  await app.close();
  await getPool().query("DELETE FROM audit_events WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM mcp_api_keys WHERE tenant_id IN ($1, $2)", [TENANT, OTHER_TENANT]);
  await getPool().query("DELETE FROM workspace_tenant_links WHERE workspace_id IN ($1, $2)", [WORKSPACE, OTHER_WORKSPACE]);
  await closePool();
  delete process.env.CALYX_INTERNAL_API_KEY;
});

describe("internal MCP credential routes", () => {
  it("keeps an established workspace mapping immutable", async () => {
    await expect(linkWorkspaceToTenant(WORKSPACE, TENANT)).resolves.toBeUndefined();
    await expect(linkWorkspaceToTenant(WORKSPACE, OTHER_TENANT)).rejects.toThrow(
      /already linked/
    );
  });

  it("rejects missing or incorrect service credentials", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/list",
      payload: { workspaceId: WORKSPACE },
    });
    expect(missing.statusCode).toBe(401);

    const wrong = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/list",
      headers: { "x-calyx-internal-key": "wrong" },
      payload: { workspaceId: WORKSPACE },
    });
    expect(wrong.statusCode).toBe(401);

    const unmapped = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/list",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: "unmapped-workspace" },
    });
    expect(unmapped.statusCode).toBe(409);
  });

  it("creates, lists, and revokes a credential within one tenant", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/create",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: WORKSPACE, name: "Claude Code", scopes: ["logs:read"], expiresInDays: 30 },
    });
    expect(create.statusCode).toBe(201);
    const created = create.json().credential as { credentialId: string; token: string };
    expect(created.token).toMatch(/^calyx_sk_/);

    const otherCreate = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/create",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: OTHER_WORKSPACE, name: "Other tenant", scopes: ["logs:read"] },
    });
    expect(otherCreate.statusCode).toBe(201);

    const list = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/list",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: WORKSPACE },
    });
    const credentials = list.json().credentials as Array<{ credentialId: string; name: string }>;
    expect(credentials).toHaveLength(1);
    expect(credentials[0].name).toBe("Claude Code");
    expect(JSON.stringify(credentials)).not.toContain("token");

    const crossTenantRevoke = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/revoke",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: OTHER_WORKSPACE, credentialId: created.credentialId },
    });
    expect(crossTenantRevoke.statusCode).toBe(404);

    const revoke = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/revoke",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: WORKSPACE, credentialId: created.credentialId },
    });
    expect(revoke.statusCode).toBe(200);

    const after = await app.inject({
      method: "POST",
      url: "/v1/mcp/credentials/list",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { workspaceId: WORKSPACE },
    });
    expect(after.json().credentials[0].revokedAt).not.toBeNull();
  });
});
