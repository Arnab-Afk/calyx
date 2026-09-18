'use client';

import { Doughnut } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

const LEVEL_COLORS: Record<string, string> = {
  debug: COLORS.debug,
  info: COLORS.info,
  warn: COLORS.warn,
  error: COLORS.error,
  fatal: COLORS.critical,
};

export function LevelDonut({ byLevel }: { byLevel: Record<string, number> }) {
  ensureChartRegistered();

  const entries = Object.entries(byLevel).filter(([, v]) => v > 0);

  return (
    <Doughnut
      data={{
        labels: entries.map(([k]) => k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: entries.map(([k]) => (LEVEL_COLORS[k] ?? COLORS.series[0]) + 'cc'),
          borderColor: entries.map(([k]) => LEVEL_COLORS[k] ?? COLORS.series[0]),
          borderWidth: 1,
        }],
      }}
      options={{
        responsive: true,
        cutout: '60%',
        plugins: {
          ...DARK_DEFAULTS.plugins,
          title: { display: true, text: 'Events by Level', ...DARK_DEFAULTS.plugins.title },
          legend: { ...DARK_DEFAULTS.plugins.legend, position: 'right' },
        },
      }}
    />
  );
}
