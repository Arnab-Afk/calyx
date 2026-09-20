import crypto from "node:crypto";
import { getPool } from "./client.js";

export type DeviceSessionStatus = "pending" | "approved" | "expired" | "consumed";

export interface DeviceSession {
  deviceCode: string;
  userCode: string;
  status: DeviceSessionStatus;
  workspaceId: string | null;
  tenantId: string | null;
  mgmtToken: string | null;
  credentialId: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
}

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomUserCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += USER_CODE_ALPHABET[bytes[i]! % USER_CODE_ALPHABET.length];
    if (i === 3) out += "-";
  }
  return out;
}

function mapRow(row: Record<string, unknown>): DeviceSession {
  return {
    deviceCode: String(row.device_code),
    userCode: String(row.user_code),
    status: String(row.status) as DeviceSessionStatus,
    workspaceId: row.workspace_id ? String(row.workspace_id) : null,
    tenantId: row.tenant_id ? String(row.tenant_id) : null,
    mgmtToken: row.mgmt_token ? String(row.mgmt_token) : null,
    credentialId: row.credential_id ? String(row.credential_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    approvedAt: row.approved_at ? new Date(String(row.approved_at)).toISOString() : null,
  };
}

export async function createDeviceSession(input?: {
  ttlSeconds?: number;
}): Promise<DeviceSession> {
  const ttl = input?.ttlSeconds ?? 15 * 60;
  const deviceCode = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttl * 1000);

  for (let attempt = 0; attempt < 5; attempt++) {
    const userCode = randomUserCode();
    try {
      const result = await getPool().query(
        `INSERT INTO cli_device_sessions (device_code, user_code, expires_at)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [deviceCode, userCode, expiresAt]
      );
      return mapRow(result.rows[0]);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") continue; // unique user_code collision
      throw error;
    }
  }
  throw new Error("Could not allocate a unique device user code");
}

export async function getDeviceSessionByDeviceCode(
  deviceCode: string
): Promise<DeviceSession | null> {
  const result = await getPool().query(
    `SELECT * FROM cli_device_sessions WHERE device_code = $1`,
    [deviceCode]
  );
  if (result.rowCount !== 1) return null;
  return mapRow(result.rows[0]);
}

export async function getDeviceSessionByUserCode(
  userCode: string
): Promise<DeviceSession | null> {
  const normalized = userCode.trim().toUpperCase();
  const result = await getPool().query(
    `SELECT * FROM cli_device_sessions WHERE user_code = $1`,
    [normalized]
  );
  if (result.rowCount !== 1) return null;
  return mapRow(result.rows[0]);
}

export async function approveDeviceSession(input: {
  userCode: string;
  workspaceId: string;
  tenantId: string;
  mgmtToken: string;
  credentialId: string;
}): Promise<DeviceSession | null> {
  const normalized = input.userCode.trim().toUpperCase();
  const tokenHash = crypto.createHash("sha256").update(input.mgmtToken).digest();
  const result = await getPool().query(
    `UPDATE cli_device_sessions
     SET status = 'approved',
         workspace_id = $2,
         tenant_id = $3,
         mgmt_token = $4,
         mgmt_token_hash = $5,
         credential_id = $6,
         approved_at = NOW()
     WHERE user_code = $1
       AND status = 'pending'
       AND expires_at > NOW()
     RETURNING *`,
    [
      normalized,
      input.workspaceId,
      input.tenantId,
      input.mgmtToken,
      tokenHash,
      input.credentialId,
    ]
  );
  if (result.rowCount !== 1) return null;
  return mapRow(result.rows[0]);
}

/** Return the one-time mgmt token and mark the session consumed. */
export async function consumeDeviceSession(
  deviceCode: string
): Promise<DeviceSession | null> {
  const result = await getPool().query(
    `WITH claimed AS (
       SELECT device_code, user_code, workspace_id, tenant_id, mgmt_token,
              credential_id, created_at, expires_at, approved_at
       FROM cli_device_sessions
       WHERE device_code = $1
         AND status = 'approved'
         AND expires_at > NOW()
         AND mgmt_token IS NOT NULL
       FOR UPDATE SKIP LOCKED
     )
     UPDATE cli_device_sessions s
     SET status = 'consumed', mgmt_token = NULL
     FROM claimed
     WHERE s.device_code = claimed.device_code
     RETURNING claimed.device_code,
               claimed.user_code,
               'consumed'::text AS status,
               claimed.workspace_id,
               claimed.tenant_id,
               claimed.mgmt_token,
               claimed.credential_id,
               claimed.created_at,
               claimed.expires_at,
               claimed.approved_at`,
    [deviceCode]
  );
  if (result.rowCount !== 1) return null;
  return mapRow(result.rows[0]);
}

export async function markExpiredDeviceSessions(): Promise<void> {
  await getPool().query(
    `UPDATE cli_device_sessions
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= NOW()`
  );
}
