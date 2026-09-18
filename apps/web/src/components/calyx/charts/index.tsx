'use client';

import dynamic from 'next/dynamic';
import { Loader } from 'lucide-react';
import { GrafanaPanel } from '../chart-registry';

const ServiceHealthBars = dynamic(() => import('./service-health-bars').then((m) => ({ default: m.ServiceHealthBars })), { ssr: false, loading: () => <ChartLoader /> });
const LevelDonut = dynamic(() => import('./level-donut').then((m) => ({ default: m.LevelDonut })), { ssr: false, loading: () => <ChartLoader /> });
const ErrorTimeseries = dynamic(() => import('./error-timeseries').then((m) => ({ default: m.ErrorTimeseries })), { ssr: false, loading: () => <ChartLoader /> });
const Gauge = dynamic(() => import('./gauge').then((m) => ({ default: m.Gauge })), { ssr: false, loading: () => <ChartLoader /> });
const SparklineGrid = dynamic(() => import('./sparkline-grid').then((m) => ({ default: m.SparklineGrid })), { ssr: false, loading: () => <ChartLoader /> });
const AnomalyScatter = dynamic(() => import('./anomaly-scatter').then((m) => ({ default: m.AnomalyScatter })), { ssr: false, loading: () => <ChartLoader /> });
const TextStatusBars = dynamic(() => import('./text-status-bars').then((m) => ({ default: m.TextStatusBars })), { ssr: false, loading: () => <ChartLoader /> });

function ChartLoader() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader className="size-5 animate-spin text-[#8e8e8e]" />
    </div>
  );
}

interface ChartProps {
  type: string;
  data: unknown;
  title?: string;
}

const TITLES: Record<string, string> = {
  'service-health-bars': 'Service health',
  'level-donut': 'Log levels',
  'error-timeseries': 'Error rate',
  'event-volume-bar': 'Event volume',
  gauge: 'Gauge',
  'sparkline-grid': 'Trends',
  'anomaly-scatter': 'Anomalies',
  'text-status-bars': 'Status',
};

export function CalyxChart({ type, data, title }: ChartProps) {
  if (!data) return null;

  const panelTitle = title ?? TITLES[type] ?? 'Observability';

  const inner = (() => {
    switch (type) {
      case 'service-health-bars':
      case 'event-volume-bar':
        return <ServiceHealthBars stats={data as never} />;
      case 'level-donut':
        return (
          <div className="max-w-xs">
            <LevelDonut byLevel={data as never} />
          </div>
        );
      case 'error-timeseries':
        return <ErrorTimeseries series={data as never} />;
      case 'gauge': {
        const g = data as { value: number; label?: string; maxValue?: number };
        return (
          <div className="max-w-xs">
            <Gauge value={g.value} label={g.label} maxValue={g.maxValue} />
          </div>
        );
      }
      case 'sparkline-grid':
        return <SparklineGrid series={data as never} />;
      case 'anomaly-scatter':
        return <AnomalyScatter points={data as never} />;
      case 'text-status-bars':
        return <TextStatusBars services={data as never} />;
      default:
        return null;
    }
  })();

  if (!inner) return null;

  return <GrafanaPanel title={panelTitle}>{inner}</GrafanaPanel>;
}
