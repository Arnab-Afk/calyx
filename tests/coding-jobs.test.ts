import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "../src/storage/client.js";
import {
  authenticateCodingJobToken,
  claimCodingJobSubmission,
  completeCodingJobPullRequest,
  createCodingJob,
  getCodingJob,
  listCodingJobs,
} from "../src/storage/coding-jobs.js";

const TENANT = "coding-job-tests";
const OTHER = "coding-job-tests-other";
let incidentId: string;
let projectId: string;

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM incidents WHERE tenant_id IN ($1,$2)", [
    TENANT,
    OTHER,
  ]);
  await pool.query("DELETE FROM projects WHERE tenant_id IN ($1,$2)", [
    TENANT,
    OTHER,
  ]);
  const project = await pool.query(
    `INSERT INTO projects (tenant_id, name, slug) VALUES ($1,'API','api') RETURNING id`,
    [TENANT],
  );
  projectId = project.rows[0].id;
  await pool.query(
    `INSERT INTO github_connections (project_id, tenant_id, repo, installation_id, webhook_secret)
     VALUES ($1,$2,'acme/api','12345','secret')`,
    [projectId, TENANT],
  );
  const incident = await pool.query(
    `INSERT INTO incidents (tenant_id,title,summary,service,severity,started_at)
     VALUES ($1,'API failure','errors','api','high',NOW()) RETURNING id`,
    [TENANT],
  );
  incidentId = incident.rows[0].id;
});

afterAll(async () => {
  await getPool().query("DELETE FROM incidents WHERE tenant_id IN ($1,$2)", [
    TENANT,
    OTHER,
  ]);
  await getPool().query("DELETE FROM projects WHERE tenant_id IN ($1,$2)", [
    TENANT,
    OTHER,
  ]);
  await closePool();
});

describe("durable coding-agent jobs", () => {
  it("binds a launch to one tenant incident, repository, and installation", async () => {
    const created = await createCodingJob({
      tenantId: TENANT,
      incidentId,
      projectId,
      objective: "Fix the nil dereference and add a regression test",
      launchedBy: "web:workspace:member",
    });
    expect(created.callbackToken).toMatch(/^calyx_job_/);
    expect(created.job).toMatchObject({
      tenantId: TENANT,
      incidentId,
      projectId,
      repo: "acme/api",
      installationId: "12345",
      status: "queued",
    });
    expect(await getCodingJob(OTHER, created.job.id)).toBeNull();
    expect(await listCodingJobs(TENANT, incidentId)).toHaveLength(1);

    expect(
      await authenticateCodingJobToken(created.job.id, created.callbackToken),
    ).toMatchObject({
      id: created.job.id,
    });
    expect(
      await authenticateCodingJobToken(
        created.job.id,
        `${created.callbackToken}wrong`,
      ),
    ).toBeNull();

    const stored = await getPool().query(
      `SELECT callback_hash IS NOT NULL AS hashed,
              callback_hash::text LIKE '%${created.callbackToken.slice(-12)}%' AS leaks
       FROM coding_agent_jobs WHERE id=$1`,
      [created.job.id],
    );
    expect(stored.rows[0]).toEqual({ hashed: true, leaks: false });
    expect(
      await claimCodingJobSubmission(created.job.id, "coding-agent:test"),
    ).toMatchObject({ status: "submitting" });
    expect(
      await authenticateCodingJobToken(created.job.id, created.callbackToken),
    ).toBeNull();
    expect(
      await completeCodingJobPullRequest({
        jobId: created.job.id,
        actorId: "coding-agent:test",
        branchName: `calyx/${created.job.id}`,
        pullRequestNumber: 42,
        pullRequestUrl: "https://github.com/acme/api/pull/42",
      }),
    ).toMatchObject({ status: "succeeded", pullRequestNumber: 42 });

    const events = await getPool().query(
      "SELECT event_type FROM coding_agent_events WHERE job_id=$1 ORDER BY created_at, id",
      [created.job.id],
    );
    expect(events.rows.map((event) => event.event_type)).toEqual([
      "launched",
      "submission_started",
      "pull_request_created",
    ]);
  });

  it("rejects cross-tenant launches before issuing a job", async () => {
    await expect(
      createCodingJob({
        tenantId: OTHER,
        incidentId,
        projectId,
        objective: "malicious launch",
        launchedBy: "attacker",
      }),
    ).rejects.toThrow(/authenticated tenant/);
  });

  it("fails closed when a repository has no GitHub App installation", async () => {
    await getPool().query(
      "UPDATE github_connections SET installation_id=NULL WHERE project_id=$1",
      [projectId],
    );
    await expect(
      createCodingJob({
        tenantId: TENANT,
        incidentId,
        projectId,
        objective: "cannot launch",
        launchedBy: "admin",
      }),
    ).rejects.toThrow(/GitHub App installation/);
  });
});
