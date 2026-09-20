import crypto from "node:crypto";
import { getPool } from "./client.js";

function digest(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

export async function createGithubInstallationState(input: {
  tenantId: string;
  projectId: string;
  repo: string;
  returnTo?: string | null;
  ttlMinutes?: number;
}): Promise<string> {
  const token = `calyx_gh_${crypto.randomUUID().replaceAll("-", "")}_${crypto.randomBytes(24).toString("base64url")}`;
  await getPool().query(
    `INSERT INTO github_installation_states
       (tenant_id,project_id,repo,return_to,token_prefix,token_hash,expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW()+($7*INTERVAL '1 minute'))`,
    [
      input.tenantId,
      input.projectId,
      input.repo,
      input.returnTo?.trim() || null,
      token.slice(0, 32),
      digest(token),
      input.ttlMinutes ?? 10,
    ],
  );
  return token;
}

export async function consumeGithubInstallationState(token: string): Promise<{
  tenantId: string;
  projectId: string;
  repo: string;
  returnTo: string | null;
} | null> {
  if (!token.startsWith("calyx_gh_") || token.length < 60) return null;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id,tenant_id,project_id,repo,return_to,token_hash FROM github_installation_states
       WHERE token_prefix=$1 AND consumed_at IS NULL AND expires_at>NOW()
       FOR UPDATE`,
      [token.slice(0, 32)],
    );
    const row = result.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    const expected = Buffer.from(row.token_hash);
    const actual = digest(token);
    if (
      expected.length !== actual.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "UPDATE github_installation_states SET consumed_at=NOW() WHERE id=$1",
      [row.id],
    );
    await client.query("COMMIT");
    return {
      tenantId: row.tenant_id,
      projectId: row.project_id,
      repo: row.repo,
      returnTo: row.return_to ?? null,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
