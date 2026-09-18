'use client';

import { COLORS } from '../chart-registry';
import { DeltaBadge, MetricValue, MicroLabel, SegmentedBar, Subcard } from './chart-ui';

export interface SloBurnData {
  sloName: string;
  target: number;
  current: number;
  burnRate1h: number;
  burnRate6h: number;
  minutesToBreach: number | null;
}

/** SLO burn — Signal Strength + Portfolio Health layout. */
export function SloBurn({ data }: { data: SloBurnData }) {
  const errorBudgetUsed = Math.min(100, Math.max(0, ((100 - data.current) / (100 - data.target)) * 100));
  const danger = data.burnRate1h >= 2 || (data.minutesToBreach !== null && data.minutesToBreach < 60);
  const barColor = danger ? COLORS.error : errorBudgetUsed > 60 ? COLORS.warn : COLORS.ok;
  const burnDelta = (data.burnRate1h - 1) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <MicroLabel>Threshold / {data.sloName}</MicroLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <MetricValue size="lg">{data.current.toFixed(2)}%</MetricValue>
            <DeltaBadge value={-burnDelta} positiveIsGood />
          </div>
          <p className="mt-1 text-[11px] text-white/40">target {data.target}%</p>
        </div>
        <div className="text-right">
          <p className="font-[family-name:var(--font-display)] text-[22px] font-semibold tabular-nums text-[var(--sazabi-crimson)]">
            {data.burnRate1h.toFixed(1)}x
          </p>
          <MicroLabel className="mt-0.5">1h burn</MicroLabel>
        </div>
      </div>

      <div>
        <div className="mb-2 flex justify-between">
          <MicroLabel>Error budget used</MicroLabel>
          <span className="font-[family-name:var(--font-display)] text-[12px] tabular-nums text-white/70">
            {errorBudgetUsed.toFixed(0)}%
          </span>
        </div>
        <SegmentedBar value={errorBudgetUsed} color={barColor} showScale ticks={36} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Subcard className="px-2.5 py-2 text-center">
          <MicroLabel>6h burn</MicroLabel>
          <p className="mt-1 font-[family-name:var(--font-display)] text-sm font-semibold text-white">
            {data.burnRate6h.toFixed(1)}x
          </p>
        </Subcard>
        <Subcard className="px-2.5 py-2 text-center">
          <MicroLabel>Budget</MicroLabel>
          <p className="mt-1 font-[family-name:var(--font-display)] text-sm font-semibold text-white">
            {errorBudgetUsed.toFixed(0)}%
          </p>
        </Subcard>
        <Subcard className="px-2.5 py-2 text-center">
          <MicroLabel>To breach</MicroLabel>
          <p
            className={`mt-1 font-[family-name:var(--font-display)] text-sm font-semibold ${
              danger ? 'text-[var(--sazabi-crimson)]' : 'text-white'
            }`}
          >
            {data.minutesToBreach == null
              ? '—'
              : data.minutesToBreach < 60
                ? `${data.minutesToBreach}m`
                : `${(data.minutesToBreach / 60).toFixed(1)}h`}
          </p>
        </Subcard>
      </div>
    </div>
  );
}
