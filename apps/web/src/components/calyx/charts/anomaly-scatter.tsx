'use client';

import { Bubble } from 'react-chartjs-2';
import { useEffect } from 'react';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';

interface AnomalyPoint { time: string; errorRate: number; volume: number; service: string; isAnomaly?: boolean; }

export function AnomalyScatter({ points }: { points: AnomalyPoint[] }) {
  useEffect(() => { ensureChartRegistered(); }, []);

  const services = [...new Set(points.map((p) => p.service))];
  const allTimes = [...new Set(points.map((p) => p.time))];

  const datasets = services.map((svc, i) => {
    const svcPoints = points.filter((p) => p.service === svc);
    return {
      label: svc,
      data: svcPoints.map((p) => ({
        x: allTimes.indexOf(p.time),
        y: p.errorRate,
        r: Math.max(4, Math.sqrt(p.volume) * 0.4),
      })),
      backgroundColor: svcPoints.map((p) =>
        p.isAnomaly ? COLORS.critical + 'cc' : (COLORS.series[i % COLORS.series.length] + '88')
      ),
      borderColor: svcPoints.map((p) =>
        p.isAnomaly ? COLORS.critical : COLORS.series[i % COLORS.series.length]
      ),
    };
  });

  return (
    <Bubble
      data={{ datasets }}
      options={{
        responsive: true,
        plugins: {
          ...DARK_DEFAULTS.plugins,
          title: { display: true, text: 'Anomaly Timeline', ...DARK_DEFAULTS.plugins.title },
        },
        scales: {
          x: {
            ...DARK_DEFAULTS.scales.x,
            ticks: {
              ...DARK_DEFAULTS.scales.x.ticks,
              callback: (val) => allTimes[val as number] ?? val,
            },
          },
          y: { ...DARK_DEFAULTS.scales.y, min: 0, title: { display: true, text: 'Error rate %', color: COLORS.subtext } },
        },
      }}
    />
  );
}
