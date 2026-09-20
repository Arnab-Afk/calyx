import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/github/app.js", () => ({
  provisionGithubRepository: vi.fn().mockResolvedValue(undefined),
  removeGithubRepositoryWebhook: vi.fn().mockResolvedValue(undefined),
  listInstallationRepositories: vi.fn().mockResolvedValue(["acme/api"]),
}));

import { provisionGithubRepository } from "../src/github/app.js";
import { projectsRoute } from "../src/ingestion/routes/v1/projects.js";
import { createMgmtKey } from "../src/mgmt/auth.js";
import { closePool, getPool } from "../src/storage/client.js";

const TENANT = "github-install-route-tests";
const app = Fastify();
let projectId: string;
let token: string;

beforeAll(async () => {
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_APP_SLUG = "calyx-test";
  process.env.GITHUB_APP_PRIVATE_KEY = "test-key";
  process.env.CALYX_PUBLIC_URL = "https://calyx.example";
  await getPool().query("DELETE FROM projects WHERE tenant_id=$1", [TENANT]);
  await getPool().query("DELETE FROM mgmt_api_keys WHERE tenant_id=$1", [
    TENANT,
  ]);
  const project = await getPool().query(
    "INSERT INTO projects (tenant_id,name,slug) VALUES ($1,'API','api') RETURNING id",
    [TENANT],
  );
  projectId = project.rows[0].id;
  token = (
    await createMgmtKey({
      tenantId: TENANT,
      name: "admin",
      scopes: ["integrations:write"],
    })
  ).token;
  await app.register(projectsRoute);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await getPool().query("DELETE FROM projects WHERE tenant_id=$1", [TENANT]);
  await getPool().query("DELETE FROM mgmt_api_keys WHERE tenant_id=$1", [
    TENANT,
  ]);
  await closePool();
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_SLUG;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  delete process.env.CALYX_PUBLIC_URL;
});

describe("GitHub App installation route", () => {
  it("persists only after state and installation repository validation", async () => {
    const start = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/github`,
      headers: { authorization: `Bearer ${token}` },
      payload: { repo: "acme/api", installationId: "attacker-value" },
    });
    expect(start.statusCode).toBe(201);
    const installationUrl = new URL(start.json().installationUrl);
    expect(installationUrl.hostname).toBe("github.com");
    expect(installationUrl.pathname).toBe("/apps/calyx-test/installations/new");
    const state = installationUrl.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(
      await getPool().query(
        "SELECT 1 FROM github_connections WHERE project_id=$1",
        [projectId],
      ),
    ).toMatchObject({ rowCount: 0 });

    const callback = await app.inject({
      method: "GET",
      url: `/v1/github/install/callback?installation_id=99&state=${encodeURIComponent(state!)}`,
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toMatchObject({
      connected: true,
      repo: "acme/api",
      installationId: "99",
    });
    expect(provisionGithubRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: "99",
        repo: "acme/api",
        webhookUrl: `https://calyx.example/v1/webhooks/github/${projectId}`,
      }),
    );
    const stored = await getPool().query(
      "SELECT repo, installation_id FROM github_connections WHERE project_id=$1",
      [projectId],
    );
    expect(stored.rows[0]).toEqual({ repo: "acme/api", installation_id: "99" });

    const replay = await app.inject({
      method: "GET",
      url: `/v1/github/install/callback?installation_id=99&state=${encodeURIComponent(state!)}`,
    });
    expect(replay.statusCode).toBe(409);
  });

  it("does not persist an installation when repository validation fails", async () => {
    await getPool().query(
      "DELETE FROM github_connections WHERE project_id=$1",
      [projectId],
    );
    vi.mocked(provisionGithubRepository).mockRejectedValueOnce(
      new Error(
        "GitHub installation does not have access to the selected repository",
      ),
    );
    const start = await app.inject({
      method: "POST",
      url: `/v1/projects/${projectId}/github`,
      headers: { authorization: `Bearer ${token}` },
      payload: { repo: "acme/private" },
    });
    const state = new URL(start.json().installationUrl).searchParams.get(
      "state",
    )!;
    const callback = await app.inject({
      method: "GET",
      url: `/v1/github/install/callback?installation_id=100&state=${encodeURIComponent(state)}`,
    });
    expect(callback.statusCode).toBe(502);
    const stored = await getPool().query(
      "SELECT 1 FROM github_connections WHERE project_id=$1",
      [projectId],
    );
    expect(stored.rowCount).toBe(0);
  });
});
