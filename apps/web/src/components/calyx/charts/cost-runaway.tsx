'use client';

import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';
import { MetricValue, MicroLabel, MiniBars } from './chart-ui';

export interface CostRunawayData {
  points: Array<{ time: string; spend: number; baseline: number }>;
  projectedOverrunPct: number;
  unit?: string;
}

/** Spend chart with AUM-style hero + mini maturity bars. */
export function CostRunaway({ data }: { data: CostRunawayData }) {
  ensureChartRegistered();
  const unit = data.unit ?? '$';
  const latest = data.points[data.points.length - 1];
  const spendValues = data.points.map((p) => p.spend);
  const labels = data.points.slice(-4).map((p) => p.time.slice(0, 3));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <MicroLabel>Assets / spend</MicroLabel>
          <div className="mt-1">
            <MetricValue size="lg">
              {unit}
              {(latest?.spend ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </MetricValue>
          </div>
          <p className="mt-1 text-[12px] text-[var(--sazabi-crimson)]">
            Revenue pressure +{data.projectedOverrunPct.toFixed(0)}% projected
          </p>
        </div>
        <MiniBars values={spendValues.slice(-4)} labels={labels} color="#ff6f42" />
      </div>

      <Line
        data={{
          labels: data.points.map((p) => p.time),
          datasets: [
            {
              label: 'Spend',
              data: data.points.map((p) => p.spend),
              borderColor: '#ff6f42',
              backgroundColor: '#ff6f4222',
              tension: 0.35,
              fill: true,
              pointRadius: 0,
              borderWidth: 2,
            },
            {
              label: 'Baseline',
              data: data.points.map((p) => p.baseline),
              borderColor: COLORS.subtext,
              borderDash: [4, 4],
              tension: 0.2,
              pointRadius: 0,
              fill: false,
              borderWidth: 1.5,
            },
          ],
        }}
        options={{
          responsive: true,
          plugins: {
            ...DARK_DEFAULTS.plugins,
            title: { display: false },
            legend: { display: false },
            tooltip: {
              ...DARK_DEFAULTS.plugins.tooltip,
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${unit}${Number(ctx.raw).toFixed(0)}`,
              },
            },
          },
          scales: {
            x: { ...DARK_DEFAULTS.scales.x },
            y: { ...DARK_DEFAULTS.scales.y, min: 0 },
          },
        }}
      />
    </div>
  );
}
