'use client';

import { Bar } from 'react-chartjs-2';
import { useEffect } from 'react';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

interface ServiceStat {
  service: string;
  error_rate: number;
  total: number;
  by_level: Record<string, number>;
}

function zoneColor(rate: number) {
  if (rate >= 20) return COLORS.critical;
  if (rate >= 10) return COLORS.error;
  if (rate >= 5) return COLORS.warn;
  return COLORS.ok;
}

export function ServiceHealthBars({ stats }: { stats: ServiceStat[] }) {
  useEffect(() => { ensureChartRegistered(); }, []);

  const sorted = [...stats].sort((a, b) => b.error_rate - a.error_rate);

  const data = {
    labels: sorted.map((s) => s.service),
    datasets: [
      {
        label: 'Error rate %',
        data: sorted.map((s) => s.error_rate),
        backgroundColor: sorted.map((s) => zoneColor(s.error_rate) + 'cc'),
        borderColor: sorted.map((s) => zoneColor(s.error_rate)),
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  return (
    <Bar
      data={data}
      options={{
        indexAxis: 'y',
        responsive: true,
        plugins: {
          ...DARK_DEFAULTS.plugins,
          title: { display: true, text: 'Service Health', ...DARK_DEFAULTS.plugins.title },
        },
        scales: {
          x: { ...DARK_DEFAULTS.scales.x, min: 0, title: { display: true, text: 'Error rate %', color: COLORS.subtext } },
          y: { ...DARK_DEFAULTS.scales.y },
        },
      }}
    />
  );
}
