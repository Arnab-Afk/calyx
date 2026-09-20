import Fastify from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cliDeviceRoute } from "../src/ingestion/routes/v1/cli-device.js";
import { createMgmtKey } from "../src/mgmt/auth.js";
import { closePool, getPool } from "../src/storage/client.js";
import { linkWorkspaceToTenant } from "../src/storage/workspace-tenants.js";

const INTERNAL_KEY = "cli-device-test-internal-key-32bytes!!";
const WORKSPACE = "cli-device-ws";
const TENANT = "cli-device-tenant";

describe("cli device auth", () => {
  const app = Fastify();

  beforeAll(async () => {
    process.env.CALYX_INTERNAL_API_KEY = INTERNAL_KEY;
    process.env.CALYX_WEB_URL = "https://app.test";
    await app.register(cliDeviceRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closePool();
  });

  beforeEach(async () => {
    await getPool().query("DELETE FROM cli_device_sessions");
    await getPool().query("DELETE FROM workspace_tenant_links WHERE workspace_id=$1", [WORKSPACE]);
    await getPool().query("DELETE FROM mgmt_api_keys WHERE tenant_id=$1", [TENANT]);
    await linkWorkspaceToTenant(WORKSPACE, TENANT);
  });

  it("issues a code, approves via internal route, and returns a one-time mgmt token", async () => {
    const start = await app.inject({ method: "POST", url: "/v1/cli/device/code" });
    expect(start.statusCode).toBe(200);
    const device = start.json() as {
      device_code: string;
      user_code: string;
      verification_uri_complete: string;
    };
    expect(device.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(device.verification_uri_complete).toContain(device.user_code);

    const pending = await app.inject({
      method: "GET",
      url: `/v1/cli/device/poll?device_code=${encodeURIComponent(device.device_code)}`,
    });
    expect(pending.json()).toMatchObject({ status: "pending" });

    const approve = await app.inject({
      method: "POST",
      url: "/v1/internal/cli/device/approve",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { user_code: device.user_code, workspace_id: WORKSPACE, actor_id: "user-1" },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({ approved: true, tenant_id: TENANT });

    const poll = await app.inject({
      method: "GET",
      url: `/v1/cli/device/poll?device_code=${encodeURIComponent(device.device_code)}`,
    });
    expect(poll.statusCode).toBe(200);
    const body = poll.json() as { status: string; api_token: string; tenant_id: string };
    expect(body.status).toBe("approved");
    expect(body.api_token).toMatch(/^calyx_mgmt_/);
    expect(body.tenant_id).toBe(TENANT);

    const again = await app.inject({
      method: "GET",
      url: `/v1/cli/device/poll?device_code=${encodeURIComponent(device.device_code)}`,
    });
    expect(again.json()).toMatchObject({ status: "consumed" });
  });

  it("rejects approve for unlinked workspaces", async () => {
    await getPool().query("DELETE FROM workspace_tenant_links WHERE workspace_id=$1", [WORKSPACE]);
    const start = await app.inject({ method: "POST", url: "/v1/cli/device/code" });
    const device = start.json() as { user_code: string };

    const approve = await app.inject({
      method: "POST",
      url: "/v1/internal/cli/device/approve",
      headers: { "x-calyx-internal-key": INTERNAL_KEY },
      payload: { user_code: device.user_code, workspace_id: WORKSPACE },
    });
    expect(approve.statusCode).toBe(404);
  });

  it("accepts an existing mgmt key shape for journal setup path", async () => {
    const key = await createMgmtKey({ tenantId: TENANT, name: "test" });
    expect(key.token.startsWith("calyx_mgmt_")).toBe(true);
  });
});
