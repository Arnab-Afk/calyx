// Detector: error-rate spike
//
// Fires when the current window's error rate exceeds the rolling baseline
// mean by more than N standard deviations — a statistical anomaly test.
// Requires at least MIN_BASELINE_WINDOWS baseline windows to compute a
// meaningful stddev; returns nothing if there isn't enough history.

import type { Anomaly } from "../../schemas/index.js";
import type { Detector, TimeWindow } from "../types.js";

const MIN_BASELINE_WINDOWS = 3;
const SPIKE_THRESHOLD_STDDEV = 2.0;  // fire when current > mean + 2σ
const MIN_ABSOLUTE_ERROR_RATE = 1.0; // never fire if current rate < 1% (too noisy)

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], m: number): number {
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export const errorRateDetector: Detector = (
  window: TimeWindow,
  baseline: TimeWindow[]
): Anomaly[] => {
  if (baseline.length < MIN_BASELINE_WINDOWS) return [];
  if (window.event_count === 0) return [];
  if (window.error_rate < MIN_ABSOLUTE_ERROR_RATE) return [];

  const rates = baseline.map((b) => b.error_rate);
  const m = mean(rates);
  const s = stddev(rates, m);

  // If stddev is very small (stable baseline), lower bar slightly
  const threshold = m + Math.max(s, 0.5) * SPIKE_THRESHOLD_STDDEV;

  if (window.error_rate <= threshold) return [];

  const severity =
    window.error_rate > threshold * 2 ? "critical"
    : window.error_rate > threshold * 1.5 ? "high"
    : "medium";

  return [
    {
      type: "error_spike",
      severity,
      tenant_id: window.tenant_id,
      service: window.service,
      detected_at: window.to,
      evidence: {
        description:
          `Error rate of ${window.error_rate.toFixed(1)}% exceeds baseline ` +
          `mean of ${m.toFixed(1)}% by ${((window.error_rate - m) / Math.max(s, 0.01)).toFixed(1)}σ.`,
        metric_value: window.error_rate,
        baseline_value: m,
        sample_event_ids: [],
      },
    },
  ];
};
