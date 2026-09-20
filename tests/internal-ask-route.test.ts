import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/storage/workspace-tenants.js", () => ({
  tenantForWorkspace: vi.fn(),
}));
vi.mock("../src/agent/index.js", () => ({ runAgent: vi.fn() }));

import { runAgent } from "../src/agent/index.js";
import { askRoute } from "../src/ingestion/routes/v1/ask.js";
import { internalAskRoute } from "../src/ingestion/routes/v1/internal-ask.js";
import { tenantForWorkspace } from "../src/storage/workspace-tenants.js";

const tenantLookup = vi.mocked(tenantForWorkspace);
const agent = vi.mocked(runAgent);

describe("trusted internal workspace ask", () => {
  beforeEach(() => {
    process.env.CALYX_INTERNAL_API_KEY = "internal-test-key";
    vi.clearAllMocks();
  });
  afterEach(() => delete process.env.CALYX_INTERNAL_API_KEY);

  async function app() {
    const instance = Fastify();
    await instance.register(internalAskRoute);
    return instance;
  }

  it("retires the caller-selected tenant endpoint", async () => {
    const instance = Fastify();
    await instance.register(askRoute);
    const response = await instance.inject({
      method: "POST",
      url: "/v1/ask",
      headers: { "x-tenant-id": "attacker-tenant" },
      body: { message: "why" },
    });
    expect(response.statusCode).toBe(410);
    await instance.close();
  });

  it("rejects requests without the internal credential", async () => {
    const instance = await app();
    const response = await instance.inject({
      method: "POST",
      url: "/v1/internal/workspaces/workspace-a/ask",
      body: { message: "why" },
    });
    expect(response.statusCode).toBe(401);
    await instance.close();
  });

  it("rejects workspaces without a canonical tenant link", async () => {
    tenantLookup.mockResolvedValue(null);
    const instance = await app();
    const response = await instance.inject({
      method: "POST",
      url: "/v1/internal/workspaces/workspace-a/ask",
      headers: { "x-calyx-internal-key": "internal-test-key" },
      body: { message: "why" },
    });
    expect(response.statusCode).toBe(409);
    await instance.close();
  });

  it("runs the agent only under the server-resolved tenant", async () => {
    tenantLookup.mockResolvedValue("tenant-canonical");
    agent.mockResolvedValue({
      answer: "Because errors increased.",
      toolCallsMade: [],
      turns: 1,
      stopReason: "end_turn",
    });
    const instance = await app();
    const response = await instance.inject({
      method: "POST",
      url: "/v1/internal/workspaces/workspace-a/ask",
      headers: { "x-calyx-internal-key": "internal-test-key" },
      body: {
        message: "why",
        tenant_id: "attacker-tenant",
        actorId: "web:workspace-a:member-a",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(agent).toHaveBeenCalledWith(
      "tenant-canonical",
      "why",
      undefined,
      undefined,
      4096,
      { actorId: "web:workspace-a:member-a" },
    );
    await instance.close();
  });
});
