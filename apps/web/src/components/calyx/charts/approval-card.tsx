'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ApprovalCardData {
  action: string;
  target: string;
  risk: 'low' | 'medium' | 'high';
  dryRunSummary: string[];
  reversible: boolean;
  blastEstimate?: string;
}

type Phase = 'propose' | 'dry_run' | 'ready' | 'executed' | 'undone';

/** Act II approval / dry-run card. */
export function ApprovalCard({ data }: { data: ApprovalCardData }) {
  const [phase, setPhase] = useState<Phase>('propose');

  return (
    <div className="sazabi-glass sazabi-scanlines space-y-3 rounded-xl border border-[var(--sazabi-border)] bg-[rgba(70,16,22,0.45)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-white">
            Proposed action
          </p>
          <p className="mt-0.5 text-[13px] text-white/75">
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px]">{data.action}</code>
            {' on '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px]">{data.target}</code>
          </p>
        </div>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            data.risk === 'high' && 'bg-[var(--sazabi-crimson)]/25 text-[var(--sazabi-crimson)]',
            data.risk === 'medium' && 'bg-[var(--sazabi-warn)]/20 text-[var(--sazabi-warn)]',
            data.risk === 'low' && 'bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]',
          )}
        >
          {data.risk} risk
        </span>
      </div>

      {data.blastEstimate && (
        <p className="text-[11px] text-white/45">
          Blast estimate: <span className="text-white/70">{data.blastEstimate}</span>
        </p>
      )}

      {(phase === 'dry_run' || phase === 'ready' || phase === 'executed') && (
        <ul className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-2.5 font-mono text-[11px] text-[#c8f0d8]">
          {data.dryRunSummary.map((line) => (
            <li key={line}>+ {line}</li>
          ))}
        </ul>
      )}

      {phase === 'executed' && (
        <p className="animate-pulse text-[12px] text-[var(--sazabi-ok)]">Executed · audit trail written</p>
      )}
      {phase === 'undone' && <p className="text-[12px] text-white/50">Reverted via undo</p>}

      <div className="flex flex-wrap gap-2">
        {phase === 'propose' && (
          <button
            type="button"
            onClick={() => setPhase('dry_run')}
            className="sazabi-btn-ghost rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
          >
            Dry run
          </button>
        )}
        {(phase === 'dry_run' || phase === 'ready') && (
          <button
            type="button"
            onClick={() => setPhase('executed')}
            className="sazabi-btn-primary rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
          >
            Run
          </button>
        )}
        {phase === 'dry_run' && (
          <button
            type="button"
            onClick={() => setPhase('ready')}
            className="rounded-md bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/60 hover:bg-white/10"
          >
            Approve policy
          </button>
        )}
        {phase === 'executed' && data.reversible && (
          <button
            type="button"
            onClick={() => setPhase('undone')}
            className="sazabi-btn-ghost rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wide"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
