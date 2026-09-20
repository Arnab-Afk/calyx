import crypto from "node:crypto";
import { getPool } from "./client.js";

export type CodingJobStatus =
  "queued" | "running" | "submitting" | "succeeded" | "failed" | "cancelled";

export interface CodingJob {
  id: string;
  tenantId: string;
  incidentId: string;
  projectId: string;
  repo: string;
  installationId: string;
  status: CodingJobStatus;
  objective: string;
  baseRef?: string;
  branchName?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  launchedBy: string;
  errorMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

const columns = `id, tenant_id, incident_id, project_id, repo, installation_id, status,
  objective, base_ref, branch_name, pull_request_number, pull_request_url, launched_by,
  error_message, created_at, started_at, completed_at`;

function map(row: Record<string, unknown>): CodingJob {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    incidentId: row.incident_id as string,
    projectId: row.project_id as string,
    repo: row.repo as string,
    installationId: row.installation_id as string,
    status: row.status as CodingJobStatus,
    objective: row.objective as string,
    ...(typeof row.base_ref === "string" ? { baseRef: row.base_ref } : {}),
    ...(typeof row.branch_name === "string"
      ? { branchName: row.branch_name }
      : {}),
    ...(typeof row.pull_request_number === "number"
      ? { pullRequestNumber: row.pull_request_number }
      : {}),
    ...(typeof row.pull_request_url === "string"
      ? { pullRequestUrl: row.pull_request_url }
      : {}),
    launchedBy: row.launched_by as string,
    ...(typeof row.error_message === "string"
      ? { errorMessage: row.error_message }
      : {}),
    createdAt: (row.created_at as Date).toISOString(),
    ...(row.started_at instanceof Date
      ? { startedAt: row.started_at.toISOString() }
      : {}),
    ...(row.completed_at instanceof Date
      ? { completedAt: row.completed_at.toISOString() }
      : {}),
  };
}

function digest(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

export async function createCodingJob(input: {
  tenantId: string;
  incidentId: string;
  projectId: string;
  objective: string;
  baseRef?: string;
  launchedBy: string;
}): Promise<{ job: CodingJob; callbackToken: string }> {
  const callbackToken = `calyx_job_${crypto.randomUUID().replaceAll("-", "")}_${crypto.randomBytes(24).toString("base64url")}`;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const context = await client.query(
      `SELECT connection.repo, connection.installation_id
       FROM incidents incident
       JOIN projects project ON project.id=$3 AND project.tenant_id=incident.tenant_id
       JOIN github_connections connection ON connection.project_id=project.id
       WHERE incident.id=$2 AND incident.tenant_id=$1`,
      [input.tenantId, input.incidentId, input.projectId],
    );
    const row = context.rows[0];
    if (!row)
      throw new Error(
        "Incident and GitHub project must belong to the authenticated tenant",
      );
    if (!row.installation_id)
      throw new Error("GitHub App installation is required for coding handoff");

    const result = await client.query(
      `INSERT INTO coding_agent_jobs
         (tenant_id, incident_id, project_id, repo, installation_id, status, objective,
          base_ref, launched_by, callback_prefix, callback_hash)
       VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8,$9,$10)
       RETURNING ${columns}`,
      [
        input.tenantId,
        input.incidentId,
        input.projectId,
        row.repo,
        row.installation_id,
        input.objective,
        input.baseRef ?? null,
        input.launchedBy,
        callbackToken.slice(0, 32),
        digest(callbackToken),
      ],
    );
    const job = map(result.rows[0]);
    await client.query(
      `INSERT INTO coding_agent_events (job_id, tenant_id, event_type, actor_id, data)
       VALUES ($1,$2,'launched',$3,$4)`,
      [
        job.id,
        job.tenantId,
        input.launchedBy,
        { repo: job.repo, objective: job.objective },
      ],
    );
    await client.query("COMMIT");
    return { job, callbackToken };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getCodingJob(
  tenantId: string,
  jobId: string,
): Promise<CodingJob | null> {
  const result = await getPool().query(
    `SELECT ${columns} FROM coding_agent_jobs WHERE tenant_id=$1 AND id=$2`,
    [tenantId, jobId],
  );
  return result.rows[0] ? map(result.rows[0]) : null;
}

export async function listCodingJobs(
  tenantId: string,
  incidentId?: string,
): Promise<CodingJob[]> {
  const result = await getPool().query(
    `SELECT ${columns} FROM coding_agent_jobs
     WHERE tenant_id=$1${incidentId ? " AND incident_id=$2" : ""}
     ORDER BY created_at DESC LIMIT 100`,
    incidentId ? [tenantId, incidentId] : [tenantId],
  );
  return result.rows.map(map);
}

export async function authenticateCodingJobToken(
  jobId: string,
  token: string,
): Promise<CodingJob | null> {
  if (!token.startsWith("calyx_job_") || token.length < 64) return null;
  const result = await getPool().query(
    `SELECT ${columns}, callback_hash FROM coding_agent_jobs
     WHERE id=$1 AND callback_prefix=$2 AND status IN ('queued','running')`,
    [jobId, token.slice(0, 32)],
  );
  if (!result.rows[0]) return null;
  const expected = Buffer.from(result.rows[0].callback_hash);
  const actual = digest(token);
  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  )
    return null;
  return map(result.rows[0]);
}

export async function claimCodingJobSubmission(
  jobId: string,
  actorId: string,
): Promise<CodingJob | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE coding_agent_jobs SET status='submitting', started_at=COALESCE(started_at,NOW()), updated_at=NOW()
       WHERE id=$1 AND status IN ('queued','running') RETURNING ${columns}`,
      [jobId],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const job = map(result.rows[0]);
    await client.query(
      `INSERT INTO coding_agent_events (job_id,tenant_id,event_type,actor_id)
       VALUES ($1,$2,'submission_started',$3)`,
      [job.id, job.tenantId, actorId],
    );
    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeCodingJobPullRequest(input: {
  jobId: string;
  actorId: string;
  branchName: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
}): Promise<CodingJob> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE coding_agent_jobs SET status='succeeded', branch_name=$2, pull_request_number=$3,
         pull_request_url=$4, completed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='submitting' RETURNING ${columns}`,
      [
        input.jobId,
        input.branchName,
        input.pullRequestNumber,
        input.pullRequestUrl,
      ],
    );
    if (!result.rows[0])
      throw new Error(`Coding job is not submitting: ${input.jobId}`);
    const job = map(result.rows[0]);
    await client.query(
      `INSERT INTO coding_agent_events (job_id,tenant_id,event_type,actor_id,data)
       VALUES ($1,$2,'pull_request_created',$3,$4)`,
      [
        job.id,
        job.tenantId,
        input.actorId,
        {
          branchName: input.branchName,
          pullRequestNumber: input.pullRequestNumber,
          pullRequestUrl: input.pullRequestUrl,
        },
      ],
    );
    await client.query("COMMIT");
    return job;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function failCodingJob(
  jobId: string,
  actorId: string,
  error: unknown,
): Promise<void> {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).slice(0, 2000);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE coding_agent_jobs SET status='failed', error_message=$2, completed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status IN ('queued','running','submitting') RETURNING tenant_id`,
      [jobId, message],
    );
    if (result.rows[0]) {
      await client.query(
        `INSERT INTO coding_agent_events (job_id,tenant_id,event_type,actor_id,data)
         VALUES ($1,$2,'failed',$3,$4)`,
        [jobId, result.rows[0].tenant_id, actorId, { error: message }],
      );
    }
    await client.query("COMMIT");
  } catch (failure) {
    await client.query("ROLLBACK");
    throw failure;
  } finally {
    client.release();
  }
}
