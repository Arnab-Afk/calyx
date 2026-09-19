import { getPool } from "../storage/client.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
}

export function configuredMcpRateLimit(): number {
  const parsed = Number.parseInt(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? "120", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120;
}

export async function consumeAnonymousMcpRateLimit(
  identifier: string,
  limit = 30
): Promise<RateLimitResult> {
  const pool = getPool();
  await pool.query(
    "DELETE FROM mcp_anonymous_rate_limits WHERE window_start < NOW() - INTERVAL '2 minutes'"
  );
  const result = await pool.query(
    `INSERT INTO mcp_anonymous_rate_limits (identifier, window_start, request_count)
     VALUES ($1, date_trunc('minute', clock_timestamp()), 1)
     ON CONFLICT (identifier, window_start) DO UPDATE
       SET request_count = mcp_anonymous_rate_limits.request_count + 1
     RETURNING request_count, window_start + INTERVAL '1 minute' AS reset_at`,
    [identifier]
  );
  const count = result.rows[0].request_count as number;
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: result.rows[0].reset_at.toISOString(),
  };
}

export async function consumeOAuthRateLimit(
  subject: string,
  limit = configuredMcpRateLimit()
): Promise<RateLimitResult> {
  const pool = getPool();
  await pool.query(
    "DELETE FROM mcp_oauth_rate_limits WHERE window_start < NOW() - INTERVAL '2 minutes'"
  );
  const result = await pool.query(
    `INSERT INTO mcp_oauth_rate_limits (subject, window_start, request_count)
     VALUES ($1, date_trunc('minute', clock_timestamp()), 1)
     ON CONFLICT (subject, window_start) DO UPDATE
       SET request_count = mcp_oauth_rate_limits.request_count + 1
     RETURNING request_count, window_start + INTERVAL '1 minute' AS reset_at`,
    [subject]
  );
  const count = result.rows[0].request_count as number;
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: result.rows[0].reset_at.toISOString(),
  };
}

export async function consumeMcpRateLimit(
  credentialId: string,
  limit = configuredMcpRateLimit()
): Promise<RateLimitResult> {
  const pool = getPool();
  await pool.query("DELETE FROM mcp_rate_limits WHERE window_start < NOW() - INTERVAL '2 minutes'");
  const result = await pool.query(
    `INSERT INTO mcp_rate_limits (credential_id, window_start, request_count)
     VALUES ($1, date_trunc('minute', clock_timestamp()), 1)
     ON CONFLICT (credential_id, window_start) DO UPDATE
       SET request_count = mcp_rate_limits.request_count + 1
     RETURNING request_count, window_start + INTERVAL '1 minute' AS reset_at`,
    [credentialId]
  );
  const count = result.rows[0].request_count as number;
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: result.rows[0].reset_at.toISOString(),
  };
}
