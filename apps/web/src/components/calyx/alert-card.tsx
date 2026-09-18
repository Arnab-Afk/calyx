'use client';

import { useState, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const SEVERITY_META = {
  low: { color: 'text-[var(--sazabi-ok)]', glow: 'text-[var(--sazabi-ok)]' },
  medium: { color: 'text-[var(--sazabi-warn)]', glow: 'text-[var(--sazabi-warn)]' },
  high: { color: 'text-[var(--sazabi-crimson)]', glow: 'text-[var(--sazabi-crimson)]' },
  critical: { color: 'text-[#ff6b6b]', glow: 'text-[#ff6b6b]' },
};

interface AlertCardProps {
  alert: AlertData;
  onAck?: (id: string) => void;
  onResolve?: (id: string) => void;
  status?: 'active' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  resolvedBy?: string;
}

function CalyxMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/calyx-avatar.png"
      alt="Calyx"
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-[6px] object-cover shadow-[0_0_14px_rgba(230,23,109,0.35)] ring-1 ring-white/10"
    />
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{label}</p>
      <p className="text-[13px] leading-relaxed text-[#e8e0e2]">{children}</p>
    </div>
  );
}

export function AlertCard({
  alert,
  onAck,
  onResolve,
  status = 'active',
  acknowledgedBy,
  resolvedBy,
}: AlertCardProps) {
  const [localStatus, setLocalStatus] = useState(status);
  const meta = SEVERITY_META[alert.severity];
  const statusLabel =
    localStatus === 'active' ? 'Open' : localStatus === 'acknowledged' ? 'Acknowledged' : 'Resolved';

  return (
    <div className="my-1 w-full max-w-2xl">
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
              <span className="text-[12px] text-white/35">{alert.detectedAt}</span>
            </div>

            <h3 className="font-[family-name:var(--font-display)] text-[16px] font-semibold leading-snug tracking-tight text-white">
              {alert.type.replace(/_/g, ' ')} on {alert.service}
            </h3>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-white/55">
              <span className="inline-flex items-center gap-1.5">
                Severity:{' '}
                <span className={cn('font-semibold capitalize', meta.color)}>{alert.severity}</span>
                {(alert.severity === 'high' || alert.severity === 'critical') && (
                  <AlertOctagon className={cn('size-3.5', meta.glow)} strokeWidth={2.25} />
                )}
              </span>
              <span>
                Status: <span className="font-semibold text-white/80">{statusLabel}</span>
              </span>
            </div>

            {localStatus !== 'active' && (
              <p className="mt-1.5 text-[11px] text-white/40">
                {localStatus === 'acknowledged'
                  ? `Acknowledged${acknowledgedBy ? ` by ${acknowledgedBy}` : ''}`
                  : `Resolved${resolvedBy ? ` by ${resolvedBy}` : ''}`}
              </p>
            )}
          </div>
        </div>

        <div className="relative space-y-3.5 border-t border-[rgba(230,23,109,0.22)] px-4 py-3.5">
          {alert.impact ? <Section label="Impact">{alert.impact}</Section> : null}
          {alert.rootCause ? <Section label="Root cause">{alert.rootCause}</Section> : null}
          {alert.recommendation ? <Section label="Recommended action">{alert.recommendation}</Section> : null}
        </div>

        {localStatus === 'active' && (
          <div className="relative grid grid-cols-2 gap-2 border-t border-white/[0.06] px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setLocalStatus('acknowledged');
                onAck?.(alert.id);
              }}
              className="rounded-md bg-[var(--sazabi-crimson)] px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_0_20px_var(--sazabi-crimson-glow)] transition hover:brightness-110"
            >
              Acknowledge
            </button>
            <button
              type="button"
              onClick={() => {
                setLocalStatus('resolved');
                onResolve?.(alert.id);
              }}
              className="rounded-md border border-white/15 bg-black/40 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/85 transition hover:border-white/25 hover:bg-black/55 hover:text-white"
            >
              Resolve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
