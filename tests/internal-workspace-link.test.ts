import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { internalWorkspaceLinkRoute } from "../src/ingestion/routes/v1/internal-workspace-link.js";
import { createMgmtKey } from "../src/mgmt/auth.js";
import { closePool, getPool } from "../src/storage/client.js";

const INTERNAL_KEY = "workspace-link-test-internal-key-32-bytes";
const WORKSPACE = "workspace-link-auth-test";
const TENANT = "workspace-link-tenant";
const OTHER_TENANT = "workspace-link-other";
const app = Fastify();
let token: string;
let otherToken: string;

beforeAll(async () => {
  process.env.CALYX_INTERNAL_API_KEY = INTERNAL_KEY;
  await getPool().query("DELETE FROM workspace_tenant_links WHERE workspace_id=$1", [WORKSPACE]);
  await getPool().query("DELETE FROM mgmt_api_keys WHERE tenant_id IN ($1,$2)", [TENANT, OTHER_TENANT]);
  await getPool().query(
    "INSERT INTO workspace_tenant_links (workspace_id, tenant_id) VALUES ($1,$2)",
    [WORKSPACE, TENANT],
  );
  token = (await createMgmtKey({ tenantId: TENANT, name: "matching" })).token;
  otherToken = (await createMgmtKey({ tenantId: OTHER_TENANT, name: "other" })).token;
  await app.register(internalWorkspaceLinkRoute);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await getPool().query("DELETE FROM workspace_tenant_links WHERE workspace_id=$1", [WORKSPACE]);
  await getPool().query("DELETE FROM mgmt_api_keys WHERE tenant_id IN ($1,$2)", [TENANT, OTHER_TENANT]);
  await closePool();
  delete process.env.CALYX_INTERNAL_API_KEY;
});

describe("workspace management authorization", () => {
  const request = (managementToken: string, internalKey = INTERNAL_KEY) =>
    app.inject({
      method: "GET",
      url: `/v1/internal/workspaces/${WORKSPACE}/authorize-management`,
      headers: {
        authorization: `Bearer ${managementToken}`,
        "x-calyx-internal-key": internalKey,
      },
    });

  it("allows only a management credential for the workspace tenant", async () => {
    const response = await request(token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ authorized: true, projectScope: null });
  });

  it("rejects cross-tenant and invalid service credentials", async () => {
    expect((await request(otherToken)).statusCode).toBe(403);
    expect((await request(token, "wrong")).statusCode).toBe(401);
    expect((await request("invalid")).statusCode).toBe(401);
  });
});
