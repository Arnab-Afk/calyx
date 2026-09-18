'use client';

import { COLORS } from '../chart-registry';
import { MetricValue, MicroLabel } from './chart-ui';

interface Service {
  service: string;
  errorRate: number;
  total: number;
  errorCount: number;
}

function segmentColor(rate: number, i: number, hotspot: number) {
  if (i === hotspot) return COLORS.error;
  if (Math.abs(i - hotspot) === 1 && rate >= 5) return COLORS.warn;
  if (rate >= 10 && i % 11 === 3) return COLORS.warn;
  return COLORS.ok;
}

/** Uptime strip — Product Categories / Signal Strength tick language. */
export function TextStatusBars({ services }: { services: Service[] }) {
  const sorted = [...services].sort((a, b) => b.errorRate - a.errorRate);
  const segments = 52;
  const labels = ['7d', '6d', '5d', '4d', '3d', '2d', 'now'];

  return (
    <div className="space-y-5">
      {sorted.slice(0, 6).map((svc) => {
        const hotspot = Math.min(segments - 4, Math.floor((svc.errorRate / 100) * segments) + 18);
        const healthy = Math.max(0, 100 - svc.errorRate);
        return (
          <div key={svc.service}>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-display)] text-[13px] font-medium text-white">
                  {svc.service}
                </p>
                <p className="text-[11px] text-white/35">
                  {svc.errorCount.toLocaleString()} errors · {svc.total.toLocaleString()} events
                </p>
              </div>
              <div className="text-right">
                <MetricValue size="sm" className={svc.errorRate >= 5 ? 'text-[var(--sazabi-crimson)]' : undefined}>
                  {healthy.toFixed(1)}%
                </MetricValue>
                <MicroLabel className="mt-0.5">uptime</MicroLabel>
              </div>
            </div>
            <div className="flex h-6 gap-[2px]">
              {Array.from({ length: segments }, (_, i) => (
                <div
                  key={i}
                  className="min-w-0 flex-1 rounded-[2px]"
                  style={{ backgroundColor: segmentColor(svc.errorRate, i, hotspot) }}
                  title={`${svc.service} · slot ${i + 1}`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-[family-name:var(--font-body)] text-[9px] uppercase tracking-wider text-white/28">
              {labels.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
