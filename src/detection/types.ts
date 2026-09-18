import type { Anomaly } from "../schemas/index.js";

// A detector receives a window of pre-fetched stats and emits zero or more Anomalies.
// Detection and dispatch are decoupled — detectors never post to Slack.

export interface TimeWindow {
  from: string; // ISO timestamp
  to: string;
  tenant_id: string;
  service: string;
  event_count: number;
  error_count: number;    // events with level 'error' or 'fatal'
  error_rate: number;     // error_count / event_count * 100 (percentage)
}

export type Detector = (window: TimeWindow, baseline: TimeWindow[]) => Anomaly[];
