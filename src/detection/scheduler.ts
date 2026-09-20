import type pg from "pg";
import type { Alert } from "../schemas/index.js";
import {
  claimAlertDeliveries,
  enqueueAlertDelivery,
  markAlertDeliveryDelivered,
  markAlertDeliveryFailed,
  recoverStaleAlertDeliveries,
  type AlertDelivery,
} from "../storage/alert-deliveries.js";
import { getAlertContext } from "../storage/alerts.js";
import {
  claimRemediationDeliveries,
  markRemediationDeliveryDelivered,
  markRemediationDeliveryFailed,
  recoverStaleRemediationDeliveries,
  type RemediationDelivery,
} from "../storage/remediation-deliveries.js";
import {
  getRemediationRequest,
  type RemediationRequest,
} from "../storage/remediations.js";
import { getActiveTenantServices } from "../storage/events.js";
import { detectAndRecordForService } from "./runner.js";

export type DeliveryHandler = (
  delivery: AlertDelivery,
  alert: Alert,
) => Promise<{ externalId: string }>;

export type RemediationDeliveryHandler = (
  delivery: RemediationDelivery,
  request: RemediationRequest,
) => Promise<{ externalId: string }>;

export function slackChannelForTenant(
  tenantId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.CALYX_SLACK_ALERT_CHANNELS;
  if (raw) {
    let channels: unknown;
    try {
      channels = JSON.parse(raw);
    } catch {
      throw new Error("CALYX_SLACK_ALERT_CHANNELS must be a JSON object");
    }
    if (!channels || Array.isArray(channels) || typeof channels !== "object") {
      throw new Error("CALYX_SLACK_ALERT_CHANNELS must be a JSON object");
    }
    const channel = (channels as Record<string, unknown>)[tenantId];
    if (typeof channel === "string" && channel.length > 0) return channel;
  }

  if (env.CALYX_TENANT_ID === tenantId) {
    return env.CALYX_SLACK_ALERT_CHANNEL || undefined;
  }
  return undefined;
}

export async function runDetectionCycle(
  pool: pg.Pool,
  now = new Date(),
  activeLookbackHours = 24,
): Promise<{
  servicesChecked: number;
  alertsDetected: number;
  deliveriesQueued: number;
}> {
  const active = await getActiveTenantServices(
    new Date(now.getTime() - activeLookbackHours * 60 * 60 * 1000),
  );
  let alertsDetected = 0;
  let deliveriesQueued = 0;

  for (const { tenant_id: tenantId, service } of active) {
    const detected = await detectAndRecordForService(
      pool,
      tenantId,
      service,
      now,
    );
    alertsDetected += detected.length;
    const slackChannel = slackChannelForTenant(tenantId);
    if (!slackChannel) continue;
    for (const { alert } of detected) {
      const queued = await enqueueAlertDelivery({
        tenantId,
        alertId: alert.id,
        destination: "slack",
        target: slackChannel,
      });
      if (queued) deliveriesQueued++;
    }
  }

  return { servicesChecked: active.length, alertsDetected, deliveriesQueued };
}

export async function runDeliveryCycle(
  handlers: Partial<Record<AlertDelivery["destination"], DeliveryHandler>>,
): Promise<{ delivered: number; failed: number }> {
  await recoverStaleAlertDeliveries();
  const deliveries = await claimAlertDeliveries();
  let delivered = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      const context = await getAlertContext(
        delivery.tenant_id,
        delivery.alert_id,
      );
      if (!context)
        throw new Error("Alert context no longer exists for this tenant");
      const handler = handlers[delivery.destination];
      if (!handler)
        throw new Error(
          `No ${delivery.destination} delivery handler configured`,
        );
      const alert: Alert = {
        id: context.id,
        tenant_id: context.tenant_id,
        severity: context.severity,
        impact: context.evidence.description,
        root_cause: "Not yet verified",
        recommended_action:
          "Investigate the linked evidence before taking action.",
        anomaly: {
          type: context.type as Alert["anomaly"]["type"],
          severity: context.severity,
          tenant_id: context.tenant_id,
          service: context.service,
          detected_at: context.last_detected_at,
          evidence: context.evidence,
        },
        created_at: context.created_at,
      };
      const result = await handler(delivery, alert);
      await markAlertDeliveryDelivered(delivery.id, result.externalId);
      delivered++;
    } catch (error) {
      await markAlertDeliveryFailed(delivery, error);
      failed++;
    }
  }
  return { delivered, failed };
}

export async function runRemediationDeliveryCycle(
  handler?: RemediationDeliveryHandler,
): Promise<{ delivered: number; failed: number }> {
  await recoverStaleRemediationDeliveries();
  const deliveries = await claimRemediationDeliveries();
  let delivered = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    try {
      if (!handler)
        throw new Error("No Slack remediation delivery handler configured");
      const request = await getRemediationRequest(
        delivery.request_id,
        delivery.tenant_id,
      );
      if (!request || request.status !== "pending") {
        throw new Error(
          "Remediation request is no longer pending for this tenant",
        );
      }
      const result = await handler(delivery, request);
      await markRemediationDeliveryDelivered(delivery.id, result.externalId);
      delivered++;
    } catch (error) {
      await markRemediationDeliveryFailed(delivery, error);
      failed++;
    }
  }
  return { delivered, failed };
}
