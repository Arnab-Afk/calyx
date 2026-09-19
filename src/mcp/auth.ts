import crypto from "node:crypto";
import { getPool } from "../storage/client.js";
import { recordAuditEvent } from "../storage/audit.js";

export const MCP_SCOPES = ["logs:read", "incidents:read", "incidents:ask"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export interface McpPrincipal {
  credentialId: string;
  tenantId: string;
  name: string;
  scopes: McpScope[];
  expiresAt?: number;
}

export interface CreatedApiKey extends McpPrincipal {
  token: string;
  createdAt: string;
}

const TOKEN_PREFIX = "calyx_sk_";

function hashToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

function lookupPrefix(token: string): string {
  return token.slice(0, 32);
}

function normalizeScopes(scopes: string[]): McpScope[] {
  const unique = [...new Set(scopes)];
  for (const scope of unique) {
    if (!(MCP_SCOPES as readonly string[]).includes(scope)) {
      throw new Error(`Unknown MCP scope: ${scope}`);
    }
  }
  return unique as McpScope[];
}

export async function createApiKey(input: {
  tenantId: string;
  name: string;
  scopes?: string[];
  expiresAt?: Date;
}): Promise<CreatedApiKey> {
  const scopes = normalizeScopes(input.scopes ?? ["logs:read"]);
  const token = `${TOKEN_PREFIX}${crypto.randomUUID().replaceAll("-", "")}_${crypto.randomBytes(32).toString("base64url")}`;
  const prefix = lookupPrefix(token);
  const digest = hashToken(token);

  const client = await getPool().connect();
  let row: { id: string; created_at: Date };
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO mcp_api_keys (tenant_id, name, key_prefix, token_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [input.tenantId, input.name, prefix, digest, scopes, input.expiresAt ?? null]
    );
    row = result.rows[0];
    await recordAuditEvent(
      {
        tenantId: input.tenantId,
        actorType: "operator",
        action: "mcp.credential_created",
        resourceType: "mcp_credential",
        resourceId: row.id,
        success: true,
        metadata: { name: input.name, scopes },
      },
      client
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    credentialId: row.id,
    tenantId: input.tenantId,
    name: input.name,
    scopes,
    token,
    createdAt: row.created_at.toISOString(),
    ...(input.expiresAt && { expiresAt: Math.floor(input.expiresAt.getTime() / 1000) }),
  };
}

export async function authenticateApiKey(token: string): Promise<McpPrincipal | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 64) return null;

  const result = await getPool().query(
    `SELECT id, tenant_id, name, token_hash, scopes, expires_at
     FROM mcp_api_keys
     WHERE key_prefix = $1 AND revoked_at IS NULL`,
    [lookupPrefix(token)]
  );
  if (result.rowCount !== 1) return null;

  const row = result.rows[0];
  const expected = Buffer.from(row.token_hash);
  const actual = hashToken(token);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : undefined;
  if (expiresAt !== undefined && expiresAt <= Date.now()) return null;

  await getPool().query("UPDATE mcp_api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]);

  return {
    credentialId: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    scopes: normalizeScopes(row.scopes),
    ...(expiresAt !== undefined && { expiresAt: Math.floor(expiresAt / 1000) }),
  };
}

export async function listApiKeys(tenantId: string): Promise<Array<{
  credentialId: string;
  name: string;
  scopes: McpScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}>> {
  const result = await getPool().query(
    `SELECT id, name, scopes, created_at, last_used_at, expires_at, revoked_at
     FROM mcp_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return result.rows.map((row) => ({
    credentialId: row.id,
    name: row.name,
    scopes: normalizeScopes(row.scopes),
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
  }));
}

export async function revokeApiKey(credentialId: string, tenantId: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE mcp_api_keys SET revoked_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
      [credentialId, tenantId]
    );
    const success = result.rowCount === 1;
    await recordAuditEvent(
      {
        tenantId,
        actorType: "operator",
        action: "mcp.credential_revoked",
        resourceType: "mcp_credential",
        resourceId: credentialId,
        success,
      },
      client
    );
    await client.query("COMMIT");
    return success;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
