'use client';

import { Doughnut } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS } from '../chart-registry';
import { LegendList, MicroLabel, StackedSegments } from './chart-ui';

const LEVEL_COLORS: Record<string, string> = {
  debug: COLORS.debug,
  info: COLORS.info,
  warn: COLORS.warn,
  error: COLORS.error,
  fatal: COLORS.critical,
};

/** Donut + legend + stacked bar — Catalyst Customer Segments / Marketing Channels. */
export function LevelDonut({ byLevel }: { byLevel: Record<string, number> }) {
  ensureChartRegistered();

  const entries = Object.entries(byLevel).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  const colors = entries.map(([k]) => LEVEL_COLORS[k] ?? COLORS.series[0]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5">
        <div className="relative size-[120px] shrink-0">
          <Doughnut
            data={{
              labels: entries.map(([k]) => k),
              datasets: [
                {
                  data: entries.map(([, v]) => v),
                  backgroundColor: colors,
                  borderColor: '#121417',
                  borderWidth: 3,
                  hoverOffset: 2,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              cutout: '68%',
              plugins: { legend: { display: false }, tooltip: { enabled: true } },
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums text-white">
              {total >= 1000 ? `${(total / 1000).toFixed(1)}k` : total}
            </span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-white/35">events</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <MicroLabel className="mb-2.5">By level</MicroLabel>
          <LegendList
            items={entries.map(([k, v], i) => ({
              color: colors[i],
              label: k,
              value: v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
              pct: `${Math.round((v / total) * 100)}%`,
            }))}
          />
        </div>
      </div>

      <div>
        <MicroLabel className="mb-2">Mix</MicroLabel>
        <StackedSegments
          segments={entries.map(([k, v], i) => ({
            value: v,
            color: colors[i],
            label: k,
          }))}
        />
      </div>
    </div>
  );
}
