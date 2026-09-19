'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { COLORS } from '../chart-registry';

/** All-caps micro label — Signal Strength / Catalyst style */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'font-[family-name:var(--font-body)] text-[10px] font-medium uppercase tracking-[0.14em] text-white/40',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Hero metric — Chakra Petch, large tabular */
export function MetricValue({
  children,
  className,
  size = 'lg',
}: {
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}) {
  return (
    <span
      className={cn(
        'font-[family-name:var(--font-display)] font-semibold tabular-nums tracking-tight text-white',
        size === 'sm' && 'text-lg',
        size === 'md' && 'text-2xl',
        size === 'lg' && 'text-[2rem] leading-none',
        size === 'xl' && 'text-4xl leading-none',
        size === '2xl' && 'text-5xl leading-none tracking-[-0.03em]',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Delta / trend chip */
export function DeltaBadge({
  value,
  positiveIsGood = true,
  className,
}: {
  value: number;
  positiveIsGood?: boolean;
  className?: string;
}) {
  const up = value >= 0;
  const good = positiveIsGood ? up : !up;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        good ? 'bg-[var(--sazabi-ok)]/15 text-[var(--sazabi-ok)]' : 'bg-[var(--sazabi-crimson)]/15 text-[var(--sazabi-crimson)]',
        className,
      )}
    >
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

/** Nested glass subcard — roomier by default */
export function Subcard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Outline trend pill — Progress Indicator reference */
export function TrendPill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'ok' | 'warn' | 'error' | 'neutral';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium tabular-nums',
        tone === 'ok' && 'border-[var(--sazabi-ok)]/50 text-[var(--sazabi-ok)]',
        tone === 'warn' && 'border-[var(--sazabi-warn)]/50 text-[var(--sazabi-warn)]',
        tone === 'error' && 'border-[var(--sazabi-crimson)]/50 text-[var(--sazabi-crimson)]',
        tone === 'neutral' && 'border-white/25 text-white/80',
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Tall vertical tick progress — Progress Indicator reference.
 * Filled ticks = white/accent, rest = charcoal.
 */
export function VerticalTicks({
  value,
  max = 100,
  ticks = 30,
  color = '#f0e8ea',
  className,
}: {
  value: number;
  max?: number;
  ticks?: number;
  color?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((pct / 100) * ticks);
  return (
    <div className={cn('flex h-10 w-full items-stretch gap-[3px]', className)}>
      {Array.from({ length: ticks }, (_, i) => (
        <div
          key={i}
          className="min-w-0 flex-1 rounded-sm"
          style={{
            backgroundColor: i < filled ? color : 'rgba(255,255,255,0.08)',
          }}
        />
      ))}
    </div>
  );
}

/**
 * Dual labeled pill bar — Coffee/Milk reference.
 * Left + right segments with labels inside, thin separator.
 */
export function SplitPillBar({
  left,
  right,
  className,
}: {
  left: { label: string; pct: number; color?: string; textColor?: string };
  right: { label: string; pct: number; color?: string; textColor?: string };
  className?: string;
}) {
  const l = Math.max(8, Math.min(92, left.pct));
  const r = 100 - l;
  return (
    <div className={cn('flex h-12 w-full items-stretch gap-1', className)}>
      <div
        className="flex items-center rounded-xl px-4"
        style={{
          width: `${l}%`,
          backgroundColor: left.color ?? 'rgba(120, 40, 28, 0.55)',
          color: left.textColor ?? '#ff9a6b',
        }}
      >
        <span className="truncate font-[family-name:var(--font-display)] text-[12px] font-semibold uppercase tracking-[0.08em]">
          {left.label} {Math.round(left.pct)}%
        </span>
      </div>
      <div className="w-px shrink-0 self-center bg-white/80" style={{ height: '60%' }} />
      <div
        className="flex flex-1 items-center justify-end rounded-xl px-4"
        style={{
          width: `${r}%`,
          backgroundColor: right.color ?? 'rgba(255,255,255,0.08)',
          color: right.textColor ?? 'rgba(255,255,255,0.65)',
        }}
      >
        <span className="truncate font-[family-name:var(--font-display)] text-[12px] font-semibold uppercase tracking-[0.08em]">
          {Math.round(right.pct)}% {right.label}
        </span>
      </div>
    </div>
  );
}

/** Large metric tile for grid layouts */
export function MetricTile({
  label,
  value,
  hint,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn' | 'error' | 'info' | 'neutral';
  className?: string;
}) {
  const labelTone = {
    ok: 'text-[var(--sazabi-ok)]',
    warn: 'text-[var(--sazabi-warn)]',
    error: 'text-[var(--sazabi-crimson)]',
    info: 'text-[var(--sazabi-hash)]',
    neutral: 'text-white/45',
  };
  const ring = {
    ok: 'ring-[var(--sazabi-ok)]/35',
    warn: 'ring-[var(--sazabi-warn)]/30',
    error: 'ring-[var(--sazabi-crimson)]/35',
    info: 'ring-[var(--sazabi-hash)]/30',
    neutral: 'ring-white/10',
  };
  return (
    <div
      className={cn(
        'flex min-h-[7.5rem] flex-col justify-between rounded-2xl bg-black/35 p-4 ring-1',
        ring[tone],
        className,
      )}
    >
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', labelTone[tone])}>{label}</p>
      <p className="font-[family-name:var(--font-display)] text-[1.75rem] font-semibold leading-none tracking-tight text-white">
        {value}
      </p>
      {hint ? <p className="text-[11px] text-white/35">{hint}</p> : <span />}
    </div>
  );
}

/** Insight-style list row with trend */
export function StatRow({
  value,
  label,
  delta,
  positive = true,
  className,
}: {
  value: string;
  label: string;
  delta?: string;
  positive?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4 border-b border-white/[0.06] py-4 last:border-0', className)}>
      <span
        className={cn(
          'font-[family-name:var(--font-display)] text-[11px]',
          positive ? 'text-[var(--sazabi-ok)]' : 'text-[var(--sazabi-crimson)]',
        )}
        aria-hidden
      >
        {positive ? '↗' : '↘'}
      </span>
      <MetricValue size="md" className="min-w-[5.5rem]">
        {value}
      </MetricValue>
      <div className="ml-auto text-right">
        <p className="text-[12px] text-white/40">{label}</p>
        {delta ? (
          <p className={cn('text-[13px] font-medium', positive ? 'text-[var(--sazabi-ok)]' : 'text-[var(--sazabi-crimson)]')}>
            {delta}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Footer meta columns — token card reference */
export function FooterMeta({
  items,
  className,
}: {
  items: Array<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-4 border-t border-white/[0.07] pt-4',
        items.length === 2 && 'grid-cols-2',
        items.length === 3 && 'grid-cols-3',
        items.length >= 4 && 'grid-cols-2 sm:grid-cols-4',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label}>
          <MicroLabel>{item.label}</MicroLabel>
          <p className="mt-1 font-[family-name:var(--font-display)] text-[13px] text-white">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Segmented tick bar — Signal Strength style.
 * Filled solid block + remaining as thin dashes.
 */
export function SegmentedBar({
  value,
  max = 100,
  color = COLORS.error,
  ticks = 40,
  showScale = false,
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  ticks?: number;
  showScale?: boolean;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((pct / 100) * ticks);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex h-3 items-stretch gap-[2px]">
        {Array.from({ length: ticks }, (_, i) => (
          <div
            key={i}
            className="min-w-0 flex-1 rounded-[1px]"
            style={{
              backgroundColor: i < filled ? color : 'rgba(255,255,255,0.08)',
              opacity: i < filled ? 1 : i % 2 === 0 ? 0.55 : 0.25,
            }}
          />
        ))}
      </div>
      {showScale && (
        <div className="mt-1.5 flex justify-between font-[family-name:var(--font-body)] text-[9px] tabular-nums text-white/30">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      )}
    </div>
  );
}

/** Continuous gradient track with knob — Portfolio Health style */
export function GradientTrack({
  value,
  max = 100,
  from = '#e11d2e',
  to = '#f5c542',
  className,
}: {
  value: number;
  max?: number;
  from?: string;
  to?: string;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn('relative h-2 w-full rounded-full bg-white/[0.06]', className)}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${from}, ${to})`,
        }}
      />
      <div
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#1a1214] shadow-[0_0_10px_rgba(225,29,46,0.45)]"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

/** Stacked segment bar — Marketing Channels style */
export function StackedSegments({
  segments,
  className,
}: {
  segments: Array<{ value: number; color: string; label?: string }>;
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={cn('flex h-2.5 w-full overflow-hidden rounded-full', className)}>
      {segments.map((s, i) => (
        <div
          key={s.label ?? i}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          title={s.label ? `${s.label}: ${s.value}` : undefined}
        />
      ))}
    </div>
  );
}

/** Discrete radial arc — Task Progress / Info Gap style */
export function SegmentedArc({
  value,
  max = 100,
  segments = 24,
  color = '#e8e0e2',
  size = 140,
  label,
}: {
  value: number;
  max?: number;
  segments?: number;
  color?: string;
  size?: number;
  label?: string;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const filled = Math.round((pct / 100) * segments);
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = -210;
  const sweep = 240;
  const step = sweep / segments;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size * 0.72 }}>
      <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} className="overflow-visible">
        {Array.from({ length: segments }, (_, i) => {
          const a0 = ((startAngle + i * step) * Math.PI) / 180;
          const a1 = ((startAngle + (i + 0.72) * step) * Math.PI) / 180;
          const x0 = cx + r * Math.cos(a0);
          const y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1);
          const y1 = cy + r * Math.sin(a1);
          const active = i < filled;
          return (
            <line
              key={i}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={active ? color : 'rgba(255,255,255,0.12)'}
              strokeWidth={7}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
        <MetricValue size="lg">{Math.round(pct)}%</MetricValue>
        {label ? <p className="mt-0.5 max-w-[7rem] text-center text-[10px] leading-tight text-white/40">{label}</p> : null}
      </div>
    </div>
  );
}

/** Mini vertical bars — AUM / maturity style */
export function MiniBars({
  values,
  labels,
  color = '#ff6f42',
  className,
}: {
  values: number[];
  labels?: string[];
  color?: string;
  className?: string;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn('flex items-end gap-1.5', className)}>
      {values.map((v, i) => (
        <div key={labels?.[i] ?? i} className="flex flex-col items-center gap-1">
          <div
            className="w-2.5 rounded-t-sm"
            style={{
              height: `${Math.max(8, (v / max) * 56)}px`,
              background: `linear-gradient(180deg, ${color} 0%, ${color}55 100%)`,
            }}
          />
          {labels?.[i] ? (
            <span className="text-[8px] uppercase tracking-wide text-white/30">{labels[i]}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Legend row — Customer Segments style */
export function LegendList({
  items,
}: {
  items: Array<{ color: string; label: string; value: string; pct?: string }>;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-[12px]">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="min-w-0 flex-1 truncate text-white/70">{item.label}</span>
          <span className="font-[family-name:var(--font-display)] tabular-nums text-white">{item.value}</span>
          {item.pct ? <span className="w-8 text-right text-[11px] tabular-nums text-white/40">{item.pct}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** KV row for task-progress style side panels */
export function MetaRow({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] py-2 last:border-0">
      <span className="text-[12px] text-white/40">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-[family-name:var(--font-display)] text-[12px] text-white">
        {value}
        {hint}
      </span>
    </div>
  );
}

export { COLORS };
