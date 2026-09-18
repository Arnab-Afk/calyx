'use client';

import { Check } from 'lucide-react';
import { COLORS } from '../chart-registry';
import { MetaRow, MicroLabel, SegmentedArc, SegmentedBar } from './chart-ui';

function zoneColor(pct: number) {
  if (pct >= 20) return COLORS.critical;
  if (pct >= 10) return COLORS.error;
  if (pct >= 5) return COLORS.warn;
  return COLORS.ok;
}

/** Segmented arc gauge — Task Progress / Info Gap reference. */
export function Gauge({ value, label = 'Value', maxValue = 100 }: { value: number; label?: string; maxValue?: number }) {
  const clamped = Math.min(value, maxValue);
  const pct = (clamped / maxValue) * 100;
  const color = zoneColor(pct);
  const status = pct >= 20 ? 'Critical' : pct >= 10 ? 'Elevated' : pct >= 5 ? 'Watch' : 'Normal';

  return (
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:gap-6">
      <SegmentedArc value={clamped} max={maxValue} color={color} label={label} />

      <div className="min-w-0 flex-1">
        <MicroLabel className="mb-1">{label}</MicroLabel>
        <p className="mb-3 text-[12px] leading-snug text-white/45">Live reading against configured threshold.</p>
        <div className="mb-3">
          <SegmentedBar value={clamped} max={maxValue} color={color} showScale ticks={32} />
        </div>
        <div>
          <MetaRow
            label="Status"
            value={status}
            hint={status === 'Normal' ? <Check className="size-3 text-white/70" strokeWidth={2.5} /> : undefined}
          />
          <MetaRow
            label="Progress"
            value={`${clamped.toFixed(maxValue === 100 ? 0 : 1)}${maxValue === 100 ? '%' : ''}`}
          />
          <MetaRow label="Ceiling" value={String(maxValue)} />
        </div>
      </div>
    </div>
  );
}
