import crypto from "node:crypto";
import { getPool } from "../storage/client.js";
import { bearerToken } from "../mcp/auth.js";

export const MGMT_SCOPES = [
  "projects:write",
  "sources:write",
  "integrations:write",
] as const;
export type MgmtScope = (typeof MGMT_SCOPES)[number];

export interface MgmtPrincipal {
  credentialId: string;
  tenantId: string;
  name: string;
  scopes: MgmtScope[];
}

export interface CreatedMgmtKey extends MgmtPrincipal {
  token: string;
  createdAt: string;
}

const TOKEN_PREFIX = "calyx_mgmt_";

function hashToken(token: string): Buffer {
  return crypto.createHash("sha256").update(token).digest();
}

function lookupPrefix(token: string): string {
  return token.slice(0, 32);
}

function normalizeScopes(scopes: string[]): MgmtScope[] {
  const unique = [...new Set(scopes)];
  for (const scope of unique) {
    if (!(MGMT_SCOPES as readonly string[]).includes(scope)) {
      throw new Error(`Unknown mgmt scope: ${scope}`);
    }
  }
  return unique as MgmtScope[];
}

export async function createMgmtKey(input: {
  tenantId: string;
  name: string;
  scopes?: string[];
  expiresAt?: Date;
}): Promise<CreatedMgmtKey> {
  const scopes = normalizeScopes(
    input.scopes ?? ["projects:write", "sources:write", "integrations:write"]
  );
  const token = `${TOKEN_PREFIX}${crypto.randomUUID().replaceAll("-", "")}_${crypto.randomBytes(32).toString("base64url")}`;
  const prefix = lookupPrefix(token);
  const digest = hashToken(token);

  const result = await getPool().query(
    `INSERT INTO mgmt_api_keys (tenant_id, name, key_prefix, token_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [input.tenantId, input.name, prefix, digest, scopes, input.expiresAt ?? null]
  );

  return {
    credentialId: result.rows[0].id,
    tenantId: input.tenantId,
    name: input.name,
    scopes,
    token,
    createdAt: result.rows[0].created_at.toISOString(),
  };
}

export async function authenticateMgmtKey(token: string): Promise<MgmtPrincipal | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 64) return null;

  const result = await getPool().query(
    `SELECT id, tenant_id, name, token_hash, scopes, expires_at
     FROM mgmt_api_keys
     WHERE key_prefix = $1 AND revoked_at IS NULL`,
    [lookupPrefix(token)]
  );
  if (result.rowCount !== 1) return null;

  const row = result.rows[0];
  const expected = Buffer.from(row.token_hash);
  const actual = hashToken(token);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;

  await getPool().query("UPDATE mgmt_api_keys SET last_used_at = NOW() WHERE id = $1", [row.id]);

  return {
    credentialId: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    scopes: normalizeScopes(row.scopes),
  };
}

export async function listMgmtKeys(tenantId: string) {
  const result = await getPool().query(
    `SELECT id, name, scopes, created_at, last_used_at, expires_at, revoked_at
     FROM mgmt_api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
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

export async function revokeMgmtKey(credentialId: string, tenantId: string): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE mgmt_api_keys SET revoked_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL`,
    [credentialId, tenantId]
  );
  return result.rowCount === 1;
}

export { bearerToken };

export function requireScope(principal: MgmtPrincipal, scope: MgmtScope): boolean {
  return principal.scopes.includes(scope);
}
