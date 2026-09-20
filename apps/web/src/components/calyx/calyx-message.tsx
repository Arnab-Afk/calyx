'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Clock, GitFork, Pin } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CalyxChart } from './charts/index';

export interface CalyxData {
  query: string;
  answer: string;
  chartType?: string;
  chartData?: string;
  toolNames: string[];
  tenantId: string;
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

/** Map internal tool ids → short human labels for the card meta line. */
const TOOL_LABELS: Record<string, string> = {
  query_logs: 'Logs',
  tail_logs: 'Tail',
  list_services: 'Services',
  get_service_stats: 'Health',
  get_change_context: 'GitHub changes',
  get_alert_context: 'Alert',
  list_incidents: 'Incidents',
  get_incident: 'Incident',
  search_incidents: 'Search incidents',
  search_past_incidents: 'Past incidents',
  propose_remediation: 'Remediation',
  ask: 'Ask',
  // Legacy / aspirational aliases kept for older messages
  runbook: 'Runbook',
  query_metrics: 'Metrics',
  get_flags: 'Flags',
  github: 'GitHub',
  github_actions: 'CI',
  deploy: 'Deploy',
  incidents: 'Incidents',
};

function friendlyTools(names: string[]) {
  return [...new Set(names)].map((t) => TOOL_LABELS[t] ?? t.replace(/_/g, ' '));
}

interface CalyxMessageProps {
  data: CalyxData;
  createdAt?: number;
  onTimeRangeSelect?: (hours: number, query: string, tenantId: string) => void;
}

function CalyxMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/calyx-avatar.png"
      alt="Calyx"
      width={36}
      height={36}
      className={cn(
        'size-9 shrink-0 rounded-[6px] object-cover shadow-[0_0_14px_rgba(230,23,109,0.35)] ring-1 ring-white/10',
        className,
      )}
    />
  );
}

/** Slack-style Calyx bot reply + attached chart panels + interaction dynamics. */
export function CalyxMessage({ data, createdAt, onTimeRangeSelect }: CalyxMessageProps) {
  const [activeRange, setActiveRange] = useState<number | null>(null);
  const [isRequerying, setIsRequerying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focusService, setFocusService] = useState<string | null>(null);

  const parsedChartData = useMemo(() => {
    if (!data.chartData) return null;
    try {
      return JSON.parse(data.chartData);
    } catch {
      return null;
    }
  }, [data.chartData]);

  const hasChart = Boolean(data.chartType && parsedChartData);
  const timeLabel = createdAt ? format(new Date(createdAt), 'h:mm a') : null;
  const chartTimeRange = useMemo(
    () => inferChartTimeRange(data.chartType, parsedChartData),
    [data.chartType, parsedChartData],
  );

  const sources = useMemo(() => friendlyTools(data.toolNames), [data.toolNames]);

  const answerPreview = useMemo(() => {
    const lines = data.answer.trim().split('\n').filter(Boolean);
    return lines.slice(0, 2).join('\n');
  }, [data.answer]);
  const needsDisclosure = data.answer.trim().length > answerPreview.length + 8;

  const handleTimeRange = async (hours: number) => {
    if (!onTimeRangeSelect) return;
    setActiveRange(hours);
    setIsRequerying(true);
    try {
      await onTimeRangeSelect(hours, data.query, data.tenantId);
    } finally {
      setIsRequerying(false);
      setActiveRange(null);
    }
  };

  const handleBrush = (from: string, to: string) => {
    toast.message('Brush range ready', {
      description: `Would re-query ${from} to ${to} for: ${data.query.slice(0, 60)}`,
    });
  };

  const handleFork = () => {
    toast.success('Opened investigation thread', {
      description: `Forked “${data.query.slice(0, 48)}…” with chart context`,
    });
  };

  return (
    <div className={cn('my-1 w-full max-w-3xl', pinned && 'sticky top-2 z-20')}>
      <div className="relative overflow-hidden rounded-xl border border-[var(--sazabi-border)] bg-[linear-gradient(145deg,rgba(90,18,28,0.72)_0%,rgba(28,12,16,0.88)_55%,rgba(16,10,12,0.92)_100%)] shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,120,120,0.08)] backdrop-blur-xl">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
          }}
        />

        <div className="relative flex items-start gap-3 px-4 pb-3 pt-3.5">
          <CalyxMark />

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-wide text-white">
                Calyx
              </span>
              <span className="rounded-[3px] bg-black/35 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45 ring-1 ring-white/10">
                App
              </span>
              {timeLabel ? <span className="text-[12px] text-white/35">{timeLabel}</span> : null}
              {pinned && (
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--sazabi-crimson)]">
                  <Pin className="size-3" /> pinned
                </span>
              )}
            </div>

            {/* Source meta — quiet prose, no wrench / chip row */}
            {sources.length > 0 && (
              <p className="mb-2.5 text-[11px] leading-none text-white/40">
                <span className="text-white/25">via</span>{' '}
                <span className="text-white/55">{sources.join(' · ')}</span>
                <span className="text-white/20"> · </span>
                <span className="text-white/35">fresh 12s</span>
              </p>
            )}

            <div
              className="prose prose-invert prose-sm max-w-none text-[14px] leading-relaxed text-[#e8e0e2]
              prose-p:my-1 prose-strong:text-white
              [&_a]:text-[var(--sazabi-mention)]
              [&_code]:rounded-md [&_code]:border [&_code]:border-white/10
              [&_code]:bg-black/40 [&_code]:px-1.5 [&_code]:py-0.5
              [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:font-normal [&_code]:text-[#f0dce0]
              [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/40 [&_pre]:p-3"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {expanded || !needsDisclosure ? data.answer : answerPreview}
              </ReactMarkdown>
            </div>

            {needsDisclosure && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/40 transition hover:text-white/80"
              >
                <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                {expanded ? 'Show less' : 'Show full analysis'}
              </button>
            )}

            {focusService && (
              <p className="mt-2 text-[11px] text-white/45">
                Chart focus:{' '}
                <span className="text-[var(--sazabi-mention)]">@{focusService}</span>
                <button type="button" className="ml-2 text-white/30 hover:text-white" onClick={() => setFocusService(null)}>
                  clear
                </button>
              </p>
            )}
          </div>
        </div>

        <div className="relative flex flex-wrap gap-2 border-t border-white/[0.06] px-4 py-2.5">
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px] text-white/55 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
          >
            <Pin className="size-3 opacity-70" /> {pinned ? 'Unpin' : 'Pin to channel'}
          </button>
          <button
            type="button"
            onClick={handleFork}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px] text-white/55 transition hover:border-white/20 hover:bg-white/5 hover:text-white"
          >
            <GitFork className="size-3 opacity-70" /> Open as investigation
          </button>
        </div>
      </div>

      {hasChart && (
        <div className="mt-2">
          <CalyxChart
            type={data.chartType!}
            data={parsedChartData}
            timeRange={chartTimeRange}
            onBrush={handleBrush}
            onFocus={(id) => {
              setFocusService(id);
              toast.message(`@Calyx focus ${id}`, { description: 'Would highlight that service in follow-ups' });
            }}
          />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 px-1">
        <Clock className="size-3 text-white/30" />
        <span className="text-xs text-white/30">Re-query</span>
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.hours}
              type="button"
              onClick={() => {
                if (onTimeRangeSelect) handleTimeRange(r.hours);
                else toast.message(`Re-query ${r.label}`, { description: data.query.slice(0, 80) });
              }}
              disabled={isRequerying}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                activeRange === r.hours
                  ? 'bg-[var(--sazabi-crimson)] text-white'
                  : 'bg-white/5 text-white/45 hover:bg-white/10 hover:text-white',
                isRequerying && 'cursor-not-allowed opacity-50',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function inferChartTimeRange(type: string | undefined, data: unknown): string | undefined {
  if (!data || !type) return undefined;

  if (type === 'error-timeseries' && Array.isArray(data)) {
    const series = data as Array<{ points?: Array<{ time?: string }> }>;
    const points = series[0]?.points ?? [];
    if (points.length >= 2) {
      const first = points[0]?.time;
      const last = points[points.length - 1]?.time;
      if (first && last) return `${first} – ${last}`;
    }
  }

  if (type === 'deploy-correlation') {
    const d = data as { series?: Array<{ points?: Array<{ time?: string }> }> };
    const points = d.series?.[0]?.points ?? [];
    if (points.length >= 2) return `${points[0].time} – ${points[points.length - 1].time}`;
  }

  if (type === 'compare-window') {
    return 'this deploy vs last Tue';
  }

  if (type === 'service-health-bars' || type === 'text-status-bars' || type === 'silent-failure-heatmap') {
    return '7d ago – now';
  }

  return undefined;
}

export type { AlertData } from './alert-card';
export { AlertCard } from './alert-card';
