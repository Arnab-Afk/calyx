import { getPool } from "./client.js";

export interface RemediationDelivery {
  id: string;
  tenant_id: string;
  request_id: string;
  destination: "slack";
  target: string;
  thread_ts: string;
  status: "pending" | "processing" | "delivered" | "failed";
  attempts: number;
  available_at: string;
  external_id: string | null;
  last_error: string | null;
}

function mapDelivery(row: Record<string, unknown>): RemediationDelivery {
  return {
    ...(row as unknown as RemediationDelivery),
    available_at: new Date(row.available_at as Date).toISOString(),
  };
}

export async function enqueueRemediationDelivery(input: {
  tenantId: string;
  requestId: string;
  target: string;
  threadTs: string;
}): Promise<boolean> {
  const result = await getPool().query(
    `INSERT INTO remediation_deliveries
       (tenant_id, request_id, destination, target, thread_ts)
     SELECT $1, id, 'slack', $3, $4
     FROM remediation_requests
     WHERE id=$2 AND tenant_id=$1 AND status='pending'
     ON CONFLICT (request_id, destination, target, thread_ts) DO NOTHING`,
    [input.tenantId, input.requestId, input.target, input.threadTs],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function claimRemediationDeliveries(
  limit = 20,
): Promise<RemediationDelivery[]> {
  const result = await getPool().query(
    `WITH picked AS (
       SELECT delivery.id
       FROM remediation_deliveries delivery
       JOIN remediation_requests request ON request.id=delivery.request_id
       WHERE delivery.status IN ('pending','failed')
         AND delivery.attempts < 5
         AND delivery.available_at <= NOW()
         AND request.status='pending'
       ORDER BY delivery.available_at ASC
       FOR UPDATE OF delivery SKIP LOCKED
       LIMIT $1
     )
     UPDATE remediation_deliveries delivery
     SET status='processing', attempts=attempts+1, updated_at=NOW()
     FROM picked
     WHERE delivery.id=picked.id
     RETURNING delivery.*`,
    [Math.min(limit, 100)],
  );
  return result.rows.map(mapDelivery);
}

export async function markRemediationDeliveryDelivered(
  deliveryId: string,
  externalId: string,
): Promise<void> {
  await getPool().query(
    `UPDATE remediation_deliveries
     SET status='delivered', external_id=$2, last_error=NULL, delivered_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='processing'`,
    [deliveryId, externalId],
  );
}

export async function markRemediationDeliveryFailed(
  delivery: RemediationDelivery,
  error: unknown,
): Promise<void> {
  const delaySeconds = Math.min(300, 2 ** delivery.attempts * 5);
  const message = error instanceof Error ? error.message : String(error);
  await getPool().query(
    `UPDATE remediation_deliveries
     SET status='failed', last_error=$2,
         available_at=NOW()+($3 * INTERVAL '1 second'), updated_at=NOW()
     WHERE id=$1 AND status='processing'`,
    [delivery.id, message.slice(0, 2000), delaySeconds],
  );
}

export async function recoverStaleRemediationDeliveries(): Promise<number> {
  const result = await getPool().query(
    `UPDATE remediation_deliveries
     SET status='failed', last_error='Delivery lease expired', available_at=NOW(), updated_at=NOW()
     WHERE status='processing' AND updated_at < NOW()-INTERVAL '5 minutes'`,
  );
  return result.rowCount ?? 0;
}
