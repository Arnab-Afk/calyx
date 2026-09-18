'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  BubbleController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

let registered = false;

export function ensureChartRegistered() {
  if (registered) return;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    LineElement,
    PointElement,
    ArcElement,
    BubbleController,
    Title,
    Tooltip,
    Legend,
    Filler,
  );
  registered = true;
}

/** Grafana-inspired dark panel tokens (message charts only). */
export const COLORS = {
  background: '#111217',
  surface: '#181b1f',
  panel: '#181b1f',
  border: '#2c3235',
  text: '#d8d9da',
  subtext: '#8e8e8e',
  grid: 'rgba(44, 50, 53, 0.9)',
  ok: '#73bf69',
  warn: '#fade2a',
  error: '#f2495c',
  critical: '#ff7383',
  info: '#5794f2',
  debug: '#8e8e8e',
  series: ['#5794f2', '#73bf69', '#fade2a', '#f2495c', '#b877d9', '#ff9830', '#eb7b45', '#37872d'],
};

export const DARK_DEFAULTS = {
  backgroundColor: COLORS.panel,
  color: COLORS.text,
  borderColor: COLORS.border,
  plugins: {
    legend: {
      labels: {
        color: COLORS.text,
        font: { family: 'Roboto, Helvetica, Arial, sans-serif', size: 11 },
        boxWidth: 10,
        boxHeight: 10,
        padding: 12,
      },
    },
    title: {
      color: COLORS.text,
      font: { family: 'Roboto, Helvetica, Arial, sans-serif', size: 13, weight: 'bold' as const },
      padding: { top: 4, bottom: 10 },
    },
    tooltip: {
      backgroundColor: '#181b1f',
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

/** Frame a chart like a Grafana panel (title + body). Does not affect Slack chrome. */
export function GrafanaPanel({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded border border-[#2c3235] bg-[#181b1f] shadow-[0_1px_0_rgba(0,0,0,0.4)] ${className}`}
    >
      {title ? (
        <div className="flex items-center gap-2 border-b border-[#2c3235] bg-[#111217] px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5794f2]" />
          <span className="truncate text-[11px] font-medium tracking-wide text-[#d8d9da]">
            {title}
          </span>
        </div>
      ) : null}
      <div className="p-3">{children}</div>
    </div>
  );
}
