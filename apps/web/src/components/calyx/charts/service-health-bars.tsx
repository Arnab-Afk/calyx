'use client';

import { COLORS } from '../chart-registry';
import { DeltaBadge, GradientTrack, MetricValue, MicroLabel, Subcard } from './chart-ui';

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

/** Horizontal health rows — Portfolio Health / Asset Allocation reference. */
export function ServiceHealthBars({ stats }: { stats: ServiceStat[] }) {
  const sorted = [...stats].sort((a, b) => b.error_rate - a.error_rate);
  const worst = sorted[0];
  const avg = sorted.reduce((s, x) => s + x.error_rate, 0) / (sorted.length || 1);

  return (
    <div className="space-y-4">
      {worst && (
        <div className="flex items-end justify-between gap-3">
          <div>
            <MicroLabel>Portfolio health</MicroLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <MetricValue size="xl">{(100 - worst.error_rate).toFixed(0)}%</MetricValue>
              <DeltaBadge value={-(avg - 2)} positiveIsGood />
            </div>
            <p className="mt-1.5 max-w-xs text-[11px] leading-snug text-white/40">
              Services remain within error budgets except where rates spike.
            </p>
          </div>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] tabular-nums text-white/45 ring-1 ring-white/10">
            {sorted.length} services
          </span>
        </div>
      )}

      <GradientTrack
        value={100 - (worst?.error_rate ?? 0)}
        from={COLORS.ok}
        to={COLORS.warn}
      />

      <div className="space-y-2">
        {sorted.slice(0, 6).map((s) => {
          const healthy = 100 - s.error_rate;
          const color = zoneColor(s.error_rate);
          return (
            <Subcard key={s.service} className="flex items-center gap-3 py-2.5">
              <div className="min-w-[4.5rem]">
                <p
                  className="font-[family-name:var(--font-display)] text-xl font-semibold tabular-nums"
                  style={{ color }}
                >
                  {s.error_rate.toFixed(1)}%
                </p>
                <MicroLabel className="mt-0.5">err rate</MicroLabel>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-[family-name:var(--font-display)] text-[13px] text-white">{s.service}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, s.error_rate * 2)}%`,
                      background: `linear-gradient(90deg, ${color}aa, ${color})`,
                    }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-[family-name:var(--font-display)] text-[12px] tabular-nums text-white/70">
                  {s.total.toLocaleString()}
                </p>
                <p className="text-[10px] text-white/30">events · {healthy.toFixed(0)}% ok</p>
              </div>
            </Subcard>
          );
        })}
      </div>
    </div>
  );
}
