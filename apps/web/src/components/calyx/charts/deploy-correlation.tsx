'use client';

import { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';
import { cn } from '@/lib/utils';

export interface DeployMarker {
  time: string;
  label: string;
  sha?: string;
}

export interface DeployCorrelationData {
  series: Array<{ label: string; points: Array<{ time: string; value: number }> }>;
  deploys: DeployMarker[];
}

/** Error/latency line with deploy markers — “did the deploy do this?” */
export function DeployCorrelation({ data, onBrush }: { data: DeployCorrelationData; onBrush?: (from: string, to: string) => void }) {
  ensureChartRegistered();
  const [brush, setBrush] = useState<{ from?: string; to?: string }>({});

  const labels = data.series[0]?.points.map((p) => p.time) ?? [];
  const deployIndex = useMemo(() => {
    const map = new Map<number, DeployMarker>();
    data.deploys.forEach((d) => {
      const i = labels.indexOf(d.time);
      if (i >= 0) map.set(i, d);
    });
    return map;
  }, [data.deploys, labels]);

  return (
    <div className="space-y-2">
      <Line
        data={{
          labels,
          datasets: data.series.map((s, i) => ({
            label: s.label,
            data: s.points.map((p) => p.value),
            borderColor: COLORS.series[i % COLORS.series.length],
            backgroundColor: COLORS.series[i % COLORS.series.length] + '22',
            tension: 0.35,
            fill: i === 0,
            pointRadius: 2,
          })),
        }}
        options={{
          responsive: true,
          onClick: (_e, elements) => {
            if (!elements[0] || !onBrush) return;
            const idx = elements[0].index;
            const t = labels[idx];
            setBrush((b) => {
              if (!b.from || (b.from && b.to)) {
                return { from: t };
              }
              const next = { from: b.from, to: t };
              onBrush(next.from!, next.to!);
              return next;
            });
          },
          plugins: {
            ...DARK_DEFAULTS.plugins,
            title: { display: false },
            legend: { display: true, labels: DARK_DEFAULTS.plugins.legend.labels },
            tooltip: {
              ...DARK_DEFAULTS.plugins.tooltip,
              callbacks: {
                afterBody: (items) => {
                  const i = items[0]?.dataIndex ?? -1;
                  const d = deployIndex.get(i);
                  return d ? [`Deploy: ${d.label}${d.sha ? ` (${d.sha})` : ''}`] : [];
                },
              },
            },
          },
          scales: {
            x: { ...DARK_DEFAULTS.scales.x },
            y: { ...DARK_DEFAULTS.scales.y, min: 0 },
          },
        }}
      />
      {Array.from(deployIndex.entries()).map(([idx, d]) => (
        <div key={d.time} className="sr-only">
          deploy at index {idx}: {d.label}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {data.deploys.map((d) => (
          <span
            key={d.time + d.label}
            className="rounded-md border border-[var(--sazabi-crimson)]/40 bg-[var(--sazabi-crimson)]/15 px-2 py-0.5 font-mono text-[10px] text-[#ffb0b8]"
          >
            ▲ {d.time} · {d.label}
            {d.sha ? ` · ${d.sha}` : ''}
          </span>
        ))}
      </div>
      {brush.from && (
        <p className="text-[11px] text-white/45">
          Brush: <span className="text-white/70">{brush.from}</span>
          {brush.to ? (
            <>
              {' '}
              → <span className="text-white/70">{brush.to}</span>
            </>
          ) : (
            ' · click another point to set range'
          )}
        </p>
      )}
      <p className={cn('text-[10px] text-white/30')}>Tip: click two points to brush a re-query window</p>
    </div>
  );
}
