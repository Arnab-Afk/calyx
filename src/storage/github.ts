import { getPool } from "./client.js";

export interface GithubCommitInput {
  tenantId: string;
  projectId: string;
  repo: string;
  sha: string;
  ref?: string;
  message: string;
  author?: string;
  committedAt: string;
  url?: string;
}

export interface GithubDeploymentInput {
  tenantId: string;
  projectId: string;
  repo: string;
  deploymentId: string;
  sha?: string;
  ref?: string;
  environment?: string;
  status: string;
  description?: string;
  targetUrl?: string;
  deployedAt: string;
}

export async function upsertGithubCommits(commits: GithubCommitInput[]): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const commit of commits) {
      await client.query(
        `INSERT INTO github_commits
           (tenant_id, project_id, repo, sha, ref, message, author, committed_at, url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (project_id, sha) DO UPDATE SET
           ref = EXCLUDED.ref, message = EXCLUDED.message, author = EXCLUDED.author,
           committed_at = EXCLUDED.committed_at, url = EXCLUDED.url`,
        [commit.tenantId, commit.projectId, commit.repo, commit.sha, commit.ref ?? null,
          commit.message, commit.author ?? null, commit.committedAt, commit.url ?? null]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertGithubDeployment(input: GithubDeploymentInput): Promise<void> {
  await getPool().query(
    `INSERT INTO github_deployments
       (tenant_id, project_id, repo, deployment_id, sha, ref, environment, status,
        description, target_url, deployed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (project_id, deployment_id) DO UPDATE SET
       sha = COALESCE(EXCLUDED.sha, github_deployments.sha),
       ref = COALESCE(EXCLUDED.ref, github_deployments.ref),
       environment = COALESCE(EXCLUDED.environment, github_deployments.environment),
       status = EXCLUDED.status, description = EXCLUDED.description,
       target_url = EXCLUDED.target_url, deployed_at = EXCLUDED.deployed_at,
       received_at = NOW()`,
    [input.tenantId, input.projectId, input.repo, input.deploymentId, input.sha ?? null,
      input.ref ?? null, input.environment ?? null, input.status, input.description ?? null,
      input.targetUrl ?? null, input.deployedAt]
  );
}

export async function getGithubChangeContext(input: {
  tenantId: string;
  since: string;
  until: string;
  repo?: string;
  limit?: number;
}): Promise<{ commits: Record<string, unknown>[]; deployments: Record<string, unknown>[] }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const params: unknown[] = [input.tenantId, input.since, input.until];
  const repoFilter = input.repo ? ` AND repo = $${params.push(input.repo)}` : "";
  const [commits, deployments] = await Promise.all([
    getPool().query(
      `SELECT repo, sha, ref, message, author, committed_at, url, project_id
       FROM github_commits WHERE tenant_id = $1 AND committed_at BETWEEN $2 AND $3${repoFilter}
       ORDER BY committed_at DESC LIMIT ${limit}`,
      params
    ),
    getPool().query(
      `SELECT repo, deployment_id, sha, ref, environment, status, description,
              target_url, deployed_at, project_id
       FROM github_deployments WHERE tenant_id = $1 AND deployed_at BETWEEN $2 AND $3${repoFilter}
       ORDER BY deployed_at DESC LIMIT ${limit}`,
      params
    ),
  ]);
  return { commits: commits.rows, deployments: deployments.rows };
}
