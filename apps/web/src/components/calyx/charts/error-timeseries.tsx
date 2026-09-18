'use client';

import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

interface TimePoint { time: string; value: number; }
interface TimeSeries { label: string; points: TimePoint[]; color?: string; }

export function ErrorTimeseries({ series }: { series: TimeSeries[] }) {
  ensureChartRegistered();

  const labels = series[0]?.points.map((p) => p.time) ?? [];

  return (
    <Line
      data={{
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.points.map((p) => p.value),
          borderColor: s.color ?? COLORS.series[i % COLORS.series.length],
          backgroundColor: (s.color ?? COLORS.series[i % COLORS.series.length]) + '22',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        })),
      }}
      options={{
        responsive: true,
        plugins: {
          ...DARK_DEFAULTS.plugins,
          title: { display: true, text: 'Error Rate Over Time', ...DARK_DEFAULTS.plugins.title },
        },
        scales: {
          x: { ...DARK_DEFAULTS.scales.x },
          y: { ...DARK_DEFAULTS.scales.y, min: 0, title: { display: true, text: 'Error rate %', color: COLORS.subtext } },
        },
      }}
    />
  );
}
