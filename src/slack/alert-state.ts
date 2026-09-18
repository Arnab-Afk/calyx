// In-memory alert acknowledgement / resolution state.
// In production this would be a DB table; for MVP an in-process Map is fine
// since alerts live in the same process as the Slack adapter.

export type AlertStatus = "active" | "acknowledged" | "resolved";

export interface AlertState {
  alertId: string;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  reason?: string;
}

const store = new Map<string, AlertState>();

export function getAlertState(alertId: string): AlertState {
  return store.get(alertId) ?? { alertId, status: "active" };
}

export function ackAlert(alertId: string, userId: string): AlertState {
  const existing = store.get(alertId) ?? { alertId, status: "active" as AlertStatus };
  const next: AlertState = {
    ...existing,
    status: "acknowledged",
    acknowledgedBy: userId,
    acknowledgedAt: new Date().toISOString(),
  };
  store.set(alertId, next);
  return next;
}

export function resolveAlert(
  alertId: string,
  userId: string,
  reason?: string
): AlertState {
  const existing = store.get(alertId) ?? { alertId, status: "active" as AlertStatus };
  const next: AlertState = {
    ...existing,
    status: "resolved",
    resolvedBy: userId,
    resolvedAt: new Date().toISOString(),
    reason,
  };
  store.set(alertId, next);
  return next;
}
