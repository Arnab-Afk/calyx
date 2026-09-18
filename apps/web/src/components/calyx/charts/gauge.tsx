'use client';

import { Doughnut } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

function zoneColor(pct: number) {
  if (pct >= 20) return COLORS.critical;
  if (pct >= 10) return COLORS.error;
  if (pct >= 5) return COLORS.warn;
  return COLORS.ok;
}

export function Gauge({ value, label = 'Value', maxValue = 100 }: { value: number; label?: string; maxValue?: number }) {
  ensureChartRegistered();

  const clamped = Math.min(value, maxValue);
  const color = zoneColor((clamped / maxValue) * 100);

  return (
    <div className="relative">
      <Doughnut
        data={{
          datasets: [{
            data: [clamped, maxValue - clamped, maxValue],
            backgroundColor: [color + 'cc', COLORS.surface, 'transparent'],
            borderWidth: 0,
            circumference: 180,
            rotation: -90,
          }],
        }}
        options={{
          responsive: true,
          cutout: '75%',
          plugins: {
            ...DARK_DEFAULTS.plugins,
            legend: { display: false },
            title: {
              display: true,
              text: [`${label}`, `${clamped.toFixed(1)}${maxValue === 100 ? '%' : ''}`],
              ...DARK_DEFAULTS.plugins.title,
              padding: { top: 20 },
            },
          },
        }}
      />
    </div>
  );
}
