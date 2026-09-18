'use client';

import { useState } from 'react';
import { Bot, ChevronDown, ChevronUp, Clock, Wrench, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { CalyxChart } from './charts/index';

export interface CalyxData {
  query: string;
  answer: string;
  chartType?: string;
  chartData?: string; // JSON-stringified
  toolNames: string[];
  tenantId: string;
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

interface CalyxMessageProps {
  data: CalyxData;
  onTimeRangeSelect?: (hours: number, query: string, tenantId: string) => void;
}

export function CalyxMessage({ data, onTimeRangeSelect }: CalyxMessageProps) {
  const [chartExpanded, setChartExpanded] = useState(true);
  const [activeRange, setActiveRange] = useState<number | null>(null);
  const [isRequerying, setIsRequerying] = useState(false);

  const parsedChartData = data.chartData ? (() => { try { return JSON.parse(data.chartData!); } catch { return null; } })() : null;
  const hasChart = data.chartType && parsedChartData;

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

  return (
    <div className="my-1 w-full max-w-2xl rounded-xl border border-[#2d2f33] bg-[#1a1d21] shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#2d2f33] px-4 py-2.5">
        <div className="flex size-6 items-center justify-center rounded-md bg-[#2eb67d]/20">
          <Bot className="size-3.5 text-[#2eb67d]" />
        </div>
        <span className="text-sm font-semibold text-white">Calyx</span>
        {data.toolNames.length > 0 && (
          <div className="ml-auto flex items-center gap-1 text-xs text-[#9b9ea4]">
            <Wrench className="size-3" />
            {[...new Set(data.toolNames)].join(', ')}
          </div>
        )}
      </div>

      {/* Query bubble */}
      <div className="border-b border-[#2d2f33] px-4 py-2">
        <p className="text-xs text-[#9b9ea4]">
          <span className="mr-1 text-[#36c5f0]">›</span>
          {data.query}
        </p>
      </div>

      {/* Answer */}
      <div className="px-4 py-3">
        <div className="prose prose-invert prose-sm max-w-none text-[#d1d2d3]
          [&_a]:text-[#36c5f0] [&_code]:rounded [&_code]:bg-[#222529] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs
          [&_pre]:rounded-lg [&_pre]:bg-[#222529] [&_pre]:p-3 [&_table]:text-xs
          [&_th]:border [&_th]:border-[#2d2f33] [&_th]:px-2 [&_th]:py-1
          [&_td]:border [&_td]:border-[#2d2f33] [&_td]:px-2 [&_td]:py-1">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.answer}</ReactMarkdown>
        </div>
      </div>

      {/* Chart */}
      {hasChart && (
        <div className="border-t border-[#2d2f33]">
          <button
            onClick={() => setChartExpanded((e) => !e)}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#9b9ea4] hover:text-white transition-colors"
          >
            {chartExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {chartExpanded ? 'Hide panel' : 'Show panel'}
          </button>

          {chartExpanded && (
            <div className="px-4 pb-4">
              <CalyxChart type={data.chartType!} data={parsedChartData} />
            </div>
          )}
        </div>
      )}

      {/* Time range filter */}
      {onTimeRangeSelect && (
        <div className="flex items-center gap-2 border-t border-[#2d2f33] px-4 py-2.5">
          <Clock className="size-3 text-[#9b9ea4]" />
          <span className="text-xs text-[#9b9ea4]">Re-query:</span>
          <div className="flex gap-1">
            {TIME_RANGES.map((r) => (
              <button
                key={r.hours}
                onClick={() => handleTimeRange(r.hours)}
                disabled={isRequerying}
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                  activeRange === r.hours
                    ? 'bg-[#36c5f0] text-black'
                    : 'bg-[#222529] text-[#9b9ea4] hover:bg-[#2d2f33] hover:text-white',
                  isRequerying && 'opacity-50 cursor-not-allowed'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline alert card — rendered when Calyx detects an anomaly
export interface AlertData {
  id: string;
  service: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  impact: string;
  rootCause: string;
  recommendation: string;
  detectedAt: string;
}

const SEVERITY_COLORS = {
  low: 'border-l-[#2eb67d] text-[#2eb67d]',
  medium: 'border-l-[#ecb22e] text-[#ecb22e]',
  high: 'border-l-[#e01e5a] text-[#e01e5a]',
  critical: 'border-l-[#9b0000] text-[#9b0000]',
};

const SEVERITY_ICONS = {
  low: CheckCircle,
  medium: AlertTriangle,
  high: AlertTriangle,
  critical: XCircle,
};

interface AlertCardProps {
  alert: AlertData;
  onAck?: (id: string) => void;
  onResolve?: (id: string) => void;
  status?: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  resolvedBy?: string;
}

export function AlertCard({ alert, onAck, onResolve, status = 'active', acknowledgedBy, resolvedBy }: AlertCardProps) {
  const [localStatus, setLocalStatus] = useState(status);
  const Icon = SEVERITY_ICONS[alert.severity];

  return (
    <div className={cn(
      'w-full max-w-2xl rounded-xl border border-[#2d2f33] bg-[#1a1d21] border-l-4 shadow-lg',
      SEVERITY_COLORS[alert.severity]
    )}>
      <div className="flex items-start gap-3 p-4">
        <Icon className={cn('mt-0.5 size-5 shrink-0', SEVERITY_COLORS[alert.severity].split(' ')[1])} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-white">{alert.service}</span>
            <span className={cn('text-xs font-semibold uppercase', SEVERITY_COLORS[alert.severity].split(' ')[1])}>
              {alert.severity}
            </span>
            <span className="text-xs text-[#9b9ea4]">{alert.type.replace(/_/g, ' ')}</span>
          </div>

          <p className="text-sm text-[#d1d2d3] mb-2">{alert.impact}</p>

          <div className="space-y-1 text-xs text-[#9b9ea4]">
            <div><span className="text-[#d1d2d3]">Root cause:</span> {alert.rootCause}</div>
            <div><span className="text-[#d1d2d3]">Action:</span> {alert.recommendation}</div>
          </div>

          {localStatus !== 'active' && (
            <div className="mt-2 text-xs text-[#9b9ea4]">
              {localStatus === 'acknowledged'
                ? `👀 Acknowledged${acknowledgedBy ? ` by ${acknowledgedBy}` : ''}`
                : `✅ Resolved${resolvedBy ? ` by ${resolvedBy}` : ''}`}
            </div>
          )}

          {localStatus === 'active' && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { setLocalStatus('acknowledged'); onAck?.(alert.id); }}
                className="rounded px-3 py-1 text-xs bg-[#222529] text-[#d1d2d3] hover:bg-[#2d2f33] transition-colors"
              >
                👀 Acknowledge
              </button>
              <button
                onClick={() => { setLocalStatus('resolved'); onResolve?.(alert.id); }}
                className="rounded px-3 py-1 text-xs bg-[#2eb67d]/20 text-[#2eb67d] hover:bg-[#2eb67d]/30 transition-colors"
              >
                ✅ Resolve
              </button>
            </div>
          )}
          {localStatus === 'acknowledged' && (
            <div className="mt-2">
              <button
                onClick={() => { setLocalStatus('resolved'); onResolve?.(alert.id); }}
                className="rounded px-3 py-1 text-xs bg-[#2eb67d]/20 text-[#2eb67d] hover:bg-[#2eb67d]/30 transition-colors"
              >
                ✅ Resolve
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
