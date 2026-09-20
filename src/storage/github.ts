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

export type GithubActivityItem = {
  id: string;
  kind: "push" | "merge" | "deploy" | "pull_request" | "release" | "branch" | "github";
  title: string;
  summary?: string | null;
  actor?: string | null;
  ref?: string | null;
  sha?: string | null;
  url?: string | null;
  status?: string | null;
  environment?: string | null;
  repo?: string | null;
  at: string;
};

function classifyCommitMessage(message: string): "merge" | "push" {
  const first = message.split("\n")[0] ?? message;
  if (/^merge(d)?\b/i.test(first) || /merge pull request/i.test(first)) return "merge";
  return "push";
}

export async function listGithubProjectActivity(input: {
  tenantId: string;
  projectId: string;
  limit?: number;
}): Promise<GithubActivityItem[]> {
  const limit = Math.min(Math.max(input.limit ?? 80, 1), 200);
  const pool = getPool();
  const [commits, deployments, events] = await Promise.all([
    pool.query(
      `SELECT repo, sha, ref, message, author, committed_at, url
       FROM github_commits
       WHERE tenant_id = $1 AND project_id = $2
       ORDER BY committed_at DESC
       LIMIT $3`,
      [input.tenantId, input.projectId, limit],
    ),
    pool.query(
      `SELECT repo, deployment_id, sha, ref, environment, status, description, target_url, deployed_at
       FROM github_deployments
       WHERE tenant_id = $1 AND project_id = $2
       ORDER BY deployed_at DESC
       LIMIT $3`,
      [input.tenantId, input.projectId, limit],
    ),
    pool.query(
      `SELECT id, timestamp, message, level, attributes
       FROM events
       WHERE tenant_id = $1
         AND service = 'github'
         AND (attributes->>'project_id') = $2
       ORDER BY timestamp DESC
       LIMIT $3`,
      [input.tenantId, input.projectId, limit],
    ),
  ]);

  const items: GithubActivityItem[] = [];

  for (const row of commits.rows) {
    const message = String(row.message ?? "");
    const kind = classifyCommitMessage(message);
    items.push({
      id: `commit:${row.sha}`,
      kind,
      title: message.split("\n")[0] || (kind === "merge" ? "Merge" : "Push"),
      summary: row.ref ? String(row.ref).replace(/^refs\/heads\//, "") : null,
      actor: row.author,
      ref: row.ref,
      sha: row.sha,
      url: row.url,
      repo: row.repo,
      at: new Date(row.committed_at).toISOString(),
    });
  }

  for (const row of deployments.rows) {
    items.push({
      id: `deploy:${row.deployment_id}`,
      kind: "deploy",
      title: `Deploy ${row.status}${row.environment ? ` · ${row.environment}` : ""}`,
      summary: row.description,
      ref: row.ref,
      sha: row.sha,
      url: row.target_url,
      status: row.status,
      environment: row.environment,
      repo: row.repo,
      at: new Date(row.deployed_at).toISOString(),
    });
  }

  for (const row of events.rows) {
    const attrs = (row.attributes ?? {}) as Record<string, unknown>;
    const event = String(attrs.event ?? "");
    // Skip raw push/deploy event copies when we already have durable rows.
    if (event === "push" || event === "deployment" || event === "deployment_status") continue;
    let kind: GithubActivityItem["kind"] = "github";
    if (event === "pull_request" || attrs.pr_action) {
      const action = String(attrs.pr_action ?? attrs.action ?? "");
      kind = action === "closed" && attrs.merged === true ? "merge" : "pull_request";
    } else if (event === "release") kind = "release";
    else if (event === "create" || event === "delete") kind = "branch";

    items.push({
      id: `event:${row.id}`,
      kind,
      title: String(row.message ?? `github.${event || "event"}`),
      summary: typeof attrs.ref === "string" ? attrs.ref : null,
      actor: typeof attrs.author === "string" ? attrs.author : typeof attrs.actor === "string" ? attrs.actor : null,
      ref: typeof attrs.ref === "string" ? attrs.ref : null,
      sha: typeof attrs.sha === "string" ? attrs.sha : null,
      url: typeof attrs.url === "string" ? attrs.url : null,
      status: typeof attrs.pr_action === "string" ? attrs.pr_action : typeof attrs.action === "string" ? attrs.action : null,
      repo: typeof attrs.repo === "string" ? attrs.repo : null,
      at: new Date(row.timestamp).toISOString(),
    });
  }

  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return items.slice(0, limit);
}
