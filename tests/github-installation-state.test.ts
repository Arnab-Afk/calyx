import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/storage/client.js";
import {
  consumeGithubInstallationState,
  createGithubInstallationState,
} from "../src/storage/github-installations.js";

const TENANT = "github-install-state-tests";
let projectId: string;

beforeAll(async () => {
  await getPool().query("DELETE FROM projects WHERE tenant_id=$1", [TENANT]);
  const project = await getPool().query(
    "INSERT INTO projects (tenant_id,name,slug) VALUES ($1,'API','api') RETURNING id",
    [TENANT],
  );
  projectId = project.rows[0].id;
});

afterAll(async () => {
  await getPool().query("DELETE FROM projects WHERE tenant_id=$1", [TENANT]);
  await closePool();
});

describe("GitHub installation state", () => {
  it("stores an opaque digest and consumes the tenant/project/repo binding once", async () => {
    const state = await createGithubInstallationState({
      tenantId: TENANT,
      projectId,
      repo: "acme/api",
    });
    const stored = await getPool().query(
      "SELECT token_hash, consumed_at FROM github_installation_states WHERE project_id=$1",
      [projectId],
    );
    expect(stored.rows[0].token_hash.toString("hex")).not.toContain(
      state.slice(-12),
    );
    expect(stored.rows[0].consumed_at).toBeNull();
    await expect(
      consumeGithubInstallationState(`${state}wrong`),
    ).resolves.toBeNull();
    await expect(consumeGithubInstallationState(state)).resolves.toEqual({
      tenantId: TENANT,
      projectId,
      repo: "acme/api",
    });
    await expect(consumeGithubInstallationState(state)).resolves.toBeNull();
  });

  it("rejects expired state", async () => {
    const state = await createGithubInstallationState({
      tenantId: TENANT,
      projectId,
      repo: "acme/api",
      ttlMinutes: -1,
    });
    await expect(consumeGithubInstallationState(state)).resolves.toBeNull();
  });
});
