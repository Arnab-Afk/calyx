'use client';

import { COLORS } from '../chart-registry';
import { cn } from '@/lib/utils';

export interface TimelineEvent {
  at: string;
  actor: 'calyx' | 'human' | 'system';
  label: string;
  detail?: string;
}

export interface IncidentTimelineData {
  incidentId: string;
  status: 'open' | 'resolved';
  events: TimelineEvent[];
}

const ACTOR_COLOR = {
  calyx: COLORS.error,
  human: COLORS.info,
  system: COLORS.subtext,
};

/** Incident swimlane memory timeline. */
export function IncidentTimeline({ data }: { data: IncidentTimelineData }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-white/50">{data.incidentId}</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 font-semibold uppercase tracking-wider',
            data.status === 'open' ? 'bg-[var(--sazabi-crimson)]/20 text-[var(--sazabi-crimson)]' : 'bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]',
          )}
        >
          {data.status}
        </span>
        {data.status === 'open' && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--sazabi-crimson)]">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--sazabi-crimson)] opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--sazabi-crimson)]" />
            </span>
            live
          </span>
        )}
      </div>
      <ol className="relative ml-2 space-y-0 border-l border-white/10 pl-4">
        {data.events.map((e, i) => (
          <li key={`${e.at}-${i}`} className="relative pb-4 last:pb-0">
            <span
              className="absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-black"
              style={{ background: ACTOR_COLOR[e.actor] }}
            />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-[10px] text-white/35">{e.at}</span>
              <span className="text-[12px] font-medium text-white">{e.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/30">{e.actor}</span>
            </div>
            {e.detail && <p className="mt-0.5 text-[11px] text-white/45">{e.detail}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
