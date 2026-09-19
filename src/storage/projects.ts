import crypto from "node:crypto";
import { getPool } from "./client.js";

export type SourceRole = "frontend" | "backend" | "other";

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  environment: string;
  createdAt: string;
}

export interface LogSource {
  id: string;
  projectId: string;
  tenantId: string;
  name: string;
  role: SourceRole;
  service: string;
  tokenPrefix: string;
  provider: string;
  drainSecret: string | null;
  lastEventAt: string | null;
  createdAt: string;
}

export interface CreatedLogSource extends LogSource {
  token: string;
}

export interface GithubConnection {
  projectId: string;
  tenantId: string;
  repo: string;
  installationId: string | null;
  webhookSecret: string;
  connectedAt: string;
}

export interface SlackBinding {
  projectId: string;
  tenantId: string;
  teamId: string | null;
  channelId: string;
  channelName: string | null;
  botToken: string;
  connectedAt: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
}

function hashToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    slug: String(row.slug),
    environment: String(row.environment),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

function mapSource(row: Record<string, unknown>): LogSource {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    role: row.role as SourceRole,
    service: String(row.service),
    tokenPrefix: String(row.token_prefix),
    provider: String(row.provider ?? "http"),
    drainSecret: row.drain_secret ? String(row.drain_secret) : null,
    lastEventAt: row.last_event_at
      ? new Date(row.last_event_at as string | Date).toISOString()
      : null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

export async function createProject(input: {
  tenantId: string;
  name: string;
  environment?: string;
  slug?: string;
}): Promise<Project> {
  const base = input.slug ?? slugify(input.name);
  let slug = base;
  for (let i = 0; i < 5; i++) {
    try {
      const result = await getPool().query(
        `INSERT INTO projects (tenant_id, name, slug, environment)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.tenantId, input.name, slug, input.environment ?? "production"]
      );
      return mapProject(result.rows[0]);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "23505") {
        slug = `${base}-${crypto.randomBytes(2).toString("hex")}`;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not allocate unique project slug");
}

export async function listProjects(tenantId: string): Promise<Project[]> {
  const result = await getPool().query(
    `SELECT * FROM projects WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows.map(mapProject);
}

export async function getProject(
  tenantId: string,
  idOrSlug: string
): Promise<Project | null> {
  const result = await getPool().query(
    `SELECT * FROM projects
     WHERE tenant_id = $1 AND (id::text = $2 OR slug = $2)
     LIMIT 1`,
    [tenantId, idOrSlug]
  );
  return result.rowCount === 1 ? mapProject(result.rows[0]) : null;
}

const SOURCE_TOKEN_PREFIX = "calyx_src_";

export async function createLogSource(input: {
  projectId: string;
  tenantId: string;
  name: string;
  role: SourceRole;
  service: string;
  provider?: string;
}): Promise<CreatedLogSource> {
  const token = `${SOURCE_TOKEN_PREFIX}${crypto.randomUUID().replaceAll("-", "")}_${crypto.randomBytes(24).toString("base64url")}`;
  const prefix = token.slice(0, 32);
  const digest = hashToken(token);
  const provider = input.provider ?? "http";
  const drainSecret =
    provider === "vercel" ? crypto.randomBytes(24).toString("hex") : null;

  const result = await getPool().query(
    `INSERT INTO log_sources
       (project_id, tenant_id, name, role, service, token_prefix, token_hash, provider, drain_secret)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.projectId,
      input.tenantId,
      input.name,
      input.role,
      input.service,
      prefix,
      digest,
      provider,
      drainSecret,
    ]
  );

  return { ...mapSource(result.rows[0]), token };
}

export async function getLogSourceById(sourceId: string): Promise<LogSource | null> {
  const result = await getPool().query(`SELECT * FROM log_sources WHERE id = $1`, [sourceId]);
  return result.rowCount === 1 ? mapSource(result.rows[0]) : null;
}

export async function listLogSources(projectId: string): Promise<LogSource[]> {
  const result = await getPool().query(
    `SELECT * FROM log_sources WHERE project_id = $1 ORDER BY created_at ASC`,
    [projectId]
  );
  return result.rows.map(mapSource);
}

export async function authenticateSourceToken(token: string): Promise<{
  sourceId: string;
  projectId: string;
  tenantId: string;
  service: string;
  role: SourceRole;
  provider: string;
} | null> {
  if (!token.startsWith(SOURCE_TOKEN_PREFIX) || token.length < 48) return null;

  const result = await getPool().query(
    `SELECT id, project_id, tenant_id, service, role, provider, token_hash
     FROM log_sources WHERE token_prefix = $1`,
    [token.slice(0, 32)]
  );
  if (result.rowCount !== 1) return null;

  const row = result.rows[0];
  const expected = Buffer.from(row.token_hash);
  const actual = hashToken(token);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  return {
    sourceId: row.id,
    projectId: row.project_id,
    tenantId: row.tenant_id,
    service: row.service,
    role: row.role,
    provider: row.provider,
  };
}

export async function touchLogSource(sourceId: string): Promise<void> {
  await getPool().query(
    `UPDATE log_sources SET last_event_at = NOW() WHERE id = $1`,
    [sourceId]
  );
}

export async function upsertGithubConnection(input: {
  projectId: string;
  tenantId: string;
  repo: string;
  installationId?: string;
  webhookSecret?: string;
}): Promise<GithubConnection> {
  const secret = input.webhookSecret ?? crypto.randomBytes(24).toString("hex");
  const result = await getPool().query(
    `INSERT INTO github_connections (project_id, tenant_id, repo, installation_id, webhook_secret)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id) DO UPDATE SET
       repo = EXCLUDED.repo,
       installation_id = COALESCE(EXCLUDED.installation_id, github_connections.installation_id),
       webhook_secret = EXCLUDED.webhook_secret,
       connected_at = NOW()
     RETURNING *`,
    [input.projectId, input.tenantId, input.repo, input.installationId ?? null, secret]
  );
  const row = result.rows[0];
  return {
    projectId: row.project_id,
    tenantId: row.tenant_id,
    repo: row.repo,
    installationId: row.installation_id,
    webhookSecret: row.webhook_secret,
    connectedAt: new Date(row.connected_at).toISOString(),
  };
}

export async function getGithubConnection(projectId: string): Promise<GithubConnection | null> {
  const result = await getPool().query(
    `SELECT * FROM github_connections WHERE project_id = $1`,
    [projectId]
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    projectId: row.project_id,
    tenantId: row.tenant_id,
    repo: row.repo,
    installationId: row.installation_id,
    webhookSecret: row.webhook_secret,
    connectedAt: new Date(row.connected_at).toISOString(),
  };
}

export async function upsertSlackBinding(input: {
  projectId: string;
  tenantId: string;
  channelId: string;
  channelName?: string;
  botToken: string;
  teamId?: string;
}): Promise<SlackBinding> {
  const result = await getPool().query(
    `INSERT INTO slack_bindings
       (project_id, tenant_id, team_id, channel_id, channel_name, bot_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (project_id) DO UPDATE SET
       team_id = EXCLUDED.team_id,
       channel_id = EXCLUDED.channel_id,
       channel_name = EXCLUDED.channel_name,
       bot_token = EXCLUDED.bot_token,
       connected_at = NOW()
     RETURNING *`,
    [
      input.projectId,
      input.tenantId,
      input.teamId ?? null,
      input.channelId,
      input.channelName ?? null,
      input.botToken,
    ]
  );
  const row = result.rows[0];
  return {
    projectId: row.project_id,
    tenantId: row.tenant_id,
    teamId: row.team_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    botToken: row.bot_token,
    connectedAt: new Date(row.connected_at).toISOString(),
  };
}

export async function getSlackBinding(projectId: string): Promise<SlackBinding | null> {
  const result = await getPool().query(
    `SELECT * FROM slack_bindings WHERE project_id = $1`,
    [projectId]
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    projectId: row.project_id,
    tenantId: row.tenant_id,
    teamId: row.team_id,
    channelId: row.channel_id,
    channelName: row.channel_name,
    botToken: row.bot_token,
    connectedAt: new Date(row.connected_at).toISOString(),
  };
}
