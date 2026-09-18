'use client';

import { Line } from 'react-chartjs-2';
import { useEffect } from 'react';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

interface TimePoint { time: string; value: number; }
interface TimeSeries { label: string; points: TimePoint[]; color?: string; }

export function SparklineGrid({ series }: { series: TimeSeries[] }) {
  useEffect(() => { ensureChartRegistered(); }, []);

  const labels = series[0]?.points.map((p) => p.time) ?? [];

  return (
    <Line
      data={{
        labels,
        datasets: series.map((s, i) => ({
          label: s.label,
          data: s.points.map((p) => p.value),
          borderColor: s.color ?? COLORS.series[i % COLORS.series.length],
          backgroundColor: 'transparent',
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        })),
      }}
      options={{
        responsive: true,
        plugins: {
          ...DARK_DEFAULTS.plugins,
          title: { display: true, text: 'Error Rate Sparklines', ...DARK_DEFAULTS.plugins.title },
          legend: { ...DARK_DEFAULTS.plugins.legend, position: 'right' },
        },
        scales: {
          x: { ...DARK_DEFAULTS.scales.x, display: false },
          y: { ...DARK_DEFAULTS.scales.y, min: 0, ticks: { ...DARK_DEFAULTS.scales.y.ticks, maxTicksLimit: 4 } },
        },
      }}
    />
  );
}
