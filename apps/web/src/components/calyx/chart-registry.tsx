'use client';

import {
  Chart as ChartJS,
  registerables,
} from 'chart.js';

let registered = false;

/** Register all Chart.js controllers/scales/elements before any chart mounts. */
export function ensureChartRegistered() {
  if (registered) return;
  ChartJS.register(...registerables);
  registered = true;
}

// Eager register in the browser so dynamic chart imports never race first paint
if (typeof window !== 'undefined') {
  ensureChartRegistered();
}

/** Sazabi / Calyx dark panel tokens (message charts). */
export const COLORS = {
  background: '#0a0809',
  surface: '#141014',
  panel: '#121012',
  border: 'rgba(225, 29, 46, 0.22)',
  text: '#f0e8ea',
  subtext: '#9a9092',
  grid: 'rgba(255, 255, 255, 0.06)',
  ok: '#3dd68c',
  warn: '#f5c542',
  error: '#e11d2e',
  critical: '#ff4d5e',
  info: '#5ec8ff',
  debug: '#8e8e8e',
  series: ['#e11d2e', '#f5c542', '#3dd68c', '#5ec8ff', '#ff7a45', '#b877d9', '#ff9830', '#73bf69'],
};

export const DARK_DEFAULTS = {
  backgroundColor: COLORS.panel,
  color: COLORS.text,
  borderColor: COLORS.border,
  plugins: {
    legend: {
      labels: {
        color: COLORS.text,
        font: { family: 'var(--font-body), system-ui, sans-serif', size: 11 },
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
      },
    },
    title: {
      color: COLORS.text,
      font: { family: 'var(--font-display), system-ui, sans-serif', size: 13, weight: 'bold' as const },
      padding: { top: 4, bottom: 10 },
    },
    tooltip: {
      backgroundColor: '#121012',
      titleColor: COLORS.text,
      bodyColor: COLORS.text,
      borderColor: COLORS.border,
      borderWidth: 1,
      padding: 10,
    },
  },
  scales: {
    x: {
      ticks: { color: COLORS.subtext, font: { size: 10 }, maxRotation: 0 },
      grid: { color: COLORS.grid, drawBorder: false },
      border: { color: COLORS.border },
    },
    y: {
      ticks: { color: COLORS.subtext, font: { size: 10 } },
      grid: { color: COLORS.grid, drawBorder: false },
      border: { color: COLORS.border },
    },
  },
};

/** Frame a chart like a Sazabi telemetry attachment panel. */
export function GrafanaPanel({
  title,
  timeRange,
  meta,
  children,
  className = '',
}: {
  title?: string;
  timeRange?: string;
  /** Optional right-side meta (e.g. "184K samples") */
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const cleanTitle = title?.replace(/^[–\-\s]+/, '').trim();

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121417]/95 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md ${className}`}
    >
      {cleanTitle || timeRange || meta ? (
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          {cleanTitle ? (
            <h3 className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-[14px] font-semibold tracking-tight text-white">
              {cleanTitle}
              {timeRange ? (
                <span className="font-[family-name:var(--font-body)] font-normal text-white/40">
                  {' '}
                  · {timeRange}
                </span>
              ) : null}
            </h3>
          ) : null}
          {(meta || (!cleanTitle && timeRange)) && (
            <span className="ml-auto shrink-0 font-[family-name:var(--font-body)] text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">
              {meta ?? timeRange}
            </span>
          )}
        </div>
      ) : null}
      <div className="p-4 font-[family-name:var(--font-body)]">{children}</div>
    </div>
  );
}
