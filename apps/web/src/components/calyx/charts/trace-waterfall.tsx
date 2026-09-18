'use client';

import { COLORS } from '../chart-registry';
import { cn } from '@/lib/utils';

export interface TraceSpan {
  service: string;
  operation: string;
  startMs: number;
  durationMs: number;
  status?: 'ok' | 'slow' | 'error';
}

export interface TraceWaterfallData {
  traceId: string;
  spans: TraceSpan[];
  totalMs: number;
}

/** Single-request span waterfall. */
export function TraceWaterfall({ data }: { data: TraceWaterfallData }) {
  const max = data.totalMs || Math.max(...data.spans.map((s) => s.startMs + s.durationMs), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <span className="font-mono">trace {data.traceId}</span>
        <span>{max.toFixed(0)} ms total</span>
      </div>
      <div className="space-y-1.5">
        {data.spans.map((s, i) => {
          const left = (s.startMs / max) * 100;
          const width = Math.max((s.durationMs / max) * 100, 1.5);
          const color =
            s.status === 'error' ? COLORS.error : s.status === 'slow' ? COLORS.warn : COLORS.info;
          return (
            <div key={`${s.service}-${i}`} className="grid grid-cols-[110px_1fr_48px] items-center gap-2">
              <div className="truncate text-[11px]">
                <span className="text-white/80">{s.service}</span>
                <span className="block truncate text-[10px] text-white/35">{s.operation}</span>
              </div>
              <div className="relative h-5 rounded bg-white/[0.03]">
                <div
                  className={cn('absolute top-0.5 h-4 rounded-sm')}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: color,
                    boxShadow: s.status === 'error' || s.status === 'slow' ? `0 0 10px ${color}66` : undefined,
                  }}
                  title={`${s.durationMs}ms`}
                />
              </div>
              <span className="text-right font-mono text-[10px] text-white/45">{s.durationMs}ms</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
