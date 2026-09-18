'use client';

import { Bar, Line } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

interface TimePoint {
  time: string;
  value: number;
}
interface TimeSeries {
  label: string;
  points: TimePoint[];
  color?: string;
}

function zoneColor(value: number, max: number) {
  const t = max > 0 ? value / max : 0;
  if (t >= 0.7) return COLORS.error;
  if (t >= 0.35) return COLORS.warn;
  return COLORS.ok;
}

/** Error spike chart — value-colored bars like the Sazabi Error Logs panel. */
export function ErrorTimeseries({ series }: { series: TimeSeries[] }) {
  ensureChartRegistered();

  const primary = series[0];
  const labels = primary?.points.map((p) => p.time) ?? [];
  const values = primary?.points.map((p) => p.value) ?? [];
  const max = Math.max(...values, 0.001);

  if (series.length <= 1) {
    return (
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: primary?.label ?? 'Errors',
              data: values,
              backgroundColor: values.map((v) => zoneColor(v, max) + 'cc'),
              borderColor: values.map((v) => zoneColor(v, max)),
              borderWidth: 1,
              borderRadius: 2,
              barPercentage: 0.7,
              categoryPercentage: 0.85,
            },
          ],
        }}
        options={{
          responsive: true,
          plugins: {
            ...DARK_DEFAULTS.plugins,
            legend: { display: false },
            title: { display: false },
          },
          scales: {
            x: { ...DARK_DEFAULTS.scales.x, grid: { display: false } },
            y: {
              ...DARK_DEFAULTS.scales.y,
              min: 0,
              ticks: { ...DARK_DEFAULTS.scales.y.ticks, maxTicksLimit: 4 },
            },
          },
        }}
      />
    );
  }

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
          title: { display: false },
        },
        scales: {
          x: { ...DARK_DEFAULTS.scales.x },
          y: {
            ...DARK_DEFAULTS.scales.y,
            min: 0,
            title: { display: true, text: 'Error rate %', color: COLORS.subtext },
          },
        },
      }}
    />
  );
}
