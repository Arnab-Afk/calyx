'use client';

import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { ensureChartRegistered, COLORS, DARK_DEFAULTS } from '../chart-registry';
import { cn } from '@/lib/utils';

export interface CompareWindowData {
  labelA: string;
  labelB: string;
  pointsA: Array<{ time: string; value: number }>;
  pointsB: Array<{ time: string; value: number }>;
}

/** Dual-series compare (this deploy vs baseline window). */
export function CompareWindow({ data }: { data: CompareWindowData }) {
  ensureChartRegistered();
  const [showA, setShowA] = useState(true);
  const [showB, setShowB] = useState(true);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowA((v) => !v)}
          className={cn(
            'rounded-md px-2 py-1 text-[11px] font-medium',
            showA ? 'bg-[var(--sazabi-crimson)]/25 text-[#ffb0b8]' : 'bg-white/5 text-white/30',
          )}
        >
          {data.labelA}
        </button>
        <button
          type="button"
          onClick={() => setShowB((v) => !v)}
          className={cn(
            'rounded-md px-2 py-1 text-[11px] font-medium',
            showB ? 'bg-[var(--sazabi-hash)]/20 text-[var(--sazabi-hash)]' : 'bg-white/5 text-white/30',
          )}
        >
          {data.labelB}
        </button>
      </div>
      <Line
        data={{
          labels: data.pointsA.map((p) => p.time),
          datasets: [
            ...(showA
              ? [
                  {
                    label: data.labelA,
                    data: data.pointsA.map((p) => p.value),
                    borderColor: COLORS.error,
                    backgroundColor: COLORS.error + '18',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2,
                  },
                ]
              : []),
            ...(showB
              ? [
                  {
                    label: data.labelB,
                    data: data.pointsB.map((p) => p.value),
                    borderColor: COLORS.info,
                    backgroundColor: COLORS.info + '18',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 2,
                  },
                ]
              : []),
          ],
        }}
        options={{
          responsive: true,
          plugins: { ...DARK_DEFAULTS.plugins, title: { display: false } },
          scales: {
            x: { ...DARK_DEFAULTS.scales.x },
            y: { ...DARK_DEFAULTS.scales.y, min: 0 },
          },
        }}
      />
    </div>
  );
}
