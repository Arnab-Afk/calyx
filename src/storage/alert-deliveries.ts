import { getPool } from "./client.js";

export interface AlertDelivery {
  id: string;
  tenant_id: string;
  alert_id: string;
  destination: "slack" | "web";
  target: string;
  status: "pending" | "processing" | "delivered" | "failed";
  attempts: number;
  available_at: string;
  external_id: string | null;
  last_error: string | null;
}

function mapDelivery(row: Record<string, unknown>): AlertDelivery {
  return {
    ...(row as unknown as AlertDelivery),
    available_at: new Date(row.available_at as Date).toISOString(),
  };
}

export async function enqueueAlertDelivery(input: {
  tenantId: string;
  alertId: string;
  destination: AlertDelivery["destination"];
  target: string;
}): Promise<boolean> {
  const result = await getPool().query(
    `INSERT INTO alert_deliveries (tenant_id, alert_id, destination, target)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (alert_id, destination, target) DO NOTHING`,
    [input.tenantId, input.alertId, input.destination, input.target]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function claimAlertDeliveries(limit = 20): Promise<AlertDelivery[]> {
  const result = await getPool().query(
    `WITH picked AS (
       SELECT id FROM alert_deliveries
       WHERE status IN ('pending','failed')
         AND attempts < 5
         AND available_at <= NOW()
       ORDER BY available_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE alert_deliveries delivery
     SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
     FROM picked
     WHERE delivery.id = picked.id
     RETURNING delivery.*`,
    [Math.min(limit, 100)]
  );
  return result.rows.map(mapDelivery);
}

export async function markAlertDeliveryDelivered(
  deliveryId: string,
  externalId: string
): Promise<void> {
  await getPool().query(
    `UPDATE alert_deliveries
     SET status = 'delivered', external_id = $2, last_error = NULL,
         delivered_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [deliveryId, externalId]
  );
}

export async function markAlertDeliveryFailed(
  delivery: AlertDelivery,
  error: unknown
): Promise<void> {
  const delaySeconds = Math.min(300, 2 ** delivery.attempts * 5);
  const message = error instanceof Error ? error.message : String(error);
  await getPool().query(
    `UPDATE alert_deliveries
     SET status = 'failed', last_error = $2,
         available_at = NOW() + ($3 * INTERVAL '1 second'), updated_at = NOW()
     WHERE id = $1`,
    [delivery.id, message.slice(0, 2000), delaySeconds]
  );
}

export async function recoverStaleAlertDeliveries(): Promise<number> {
  const result = await getPool().query(
    `UPDATE alert_deliveries
     SET status = 'failed', last_error = 'Delivery lease expired',
         available_at = NOW(), updated_at = NOW()
     WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes'`
  );
  return result.rowCount ?? 0;
}
