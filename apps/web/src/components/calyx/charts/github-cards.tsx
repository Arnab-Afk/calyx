'use client';

import { cn } from '@/lib/utils';

export function PrRisk({
  data,
}: {
  data: {
    number: number;
    title: string;
    author: string;
    files: number;
    additions: number;
    deletions: number;
    sensitive: string[];
    checks: Array<{ name: string; status: 'pass' | 'fail' | 'pending' }>;
  };
}) {
  const statusDot = { pass: 'bg-[var(--sazabi-ok)]', fail: 'bg-[var(--sazabi-crimson)]', pending: 'bg-[var(--sazabi-warn)]' };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-[var(--sazabi-hash)]">#{data.number}</span>
        <span className="text-[13px] font-medium text-white">{data.title}</span>
        <span className="text-[11px] text-white/35">@{data.author}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="text-white/50">{data.files} files</span>
        <span className="text-[var(--sazabi-ok)]">+{data.additions}</span>
        <span className="text-[var(--sazabi-crimson)]">−{data.deletions}</span>
      </div>
      {data.sensitive.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.sensitive.map((s) => (
            <span key={s} className="rounded border border-[var(--sazabi-warn)]/40 bg-[var(--sazabi-warn)]/10 px-1.5 py-0.5 text-[10px] text-[var(--sazabi-warn)]">
              touches {s}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {data.checks.map((c) => (
          <span key={c.name} className="inline-flex items-center gap-1.5 rounded bg-black/30 px-2 py-1 text-[10px] text-white/60">
            <i className={cn('size-1.5 rounded-full', statusDot[c.status])} />
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CiFailure({
  data,
}: {
  data: { workflow: string; job: string; verdict: 'flake' | 'real'; snippet: string[]; url?: string };
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="font-medium text-white">{data.workflow}</span>
        <span className="text-white/35">/</span>
        <span className="font-mono text-white/70">{data.job}</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            data.verdict === 'flake' ? 'bg-[var(--sazabi-warn)]/20 text-[var(--sazabi-warn)]' : 'bg-[var(--sazabi-crimson)]/20 text-[var(--sazabi-crimson)]',
          )}
        >
          {data.verdict === 'flake' ? 'likely flake' : 'real failure'}
        </span>
      </div>
      <pre className="max-h-28 overflow-auto rounded-lg border border-white/10 bg-black/40 p-2.5 font-mono text-[10px] leading-relaxed text-[#ffb0b8]">
        {data.snippet.join('\n')}
      </pre>
    </div>
  );
}

export function DeployFromCommit({
  data,
}: {
  data: { sha: string; message: string; env: string; by: string; at: string; status: string };
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-[var(--sazabi-crimson)]/15 px-2 py-3 text-center">
        <p className="font-mono text-[10px] text-[#ffb0b8]">{data.sha.slice(0, 7)}</p>
      </div>
      <div className="min-w-0 flex-1 text-[12px]">
        <p className="truncate font-medium text-white">{data.message}</p>
        <p className="mt-1 text-white/45">
          → <span className="text-white/80">{data.env}</span> · {data.by} · {data.at}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--sazabi-ok)]">{data.status}</p>
      </div>
    </div>
  );
}

export function BlameHotspot({
  data,
}: {
  data: { files: Array<{ path: string; incidents: number; lastAt: string }> };
}) {
  return (
    <div className="space-y-1.5">
      {data.files.map((f) => (
        <div key={f.path} className="flex items-center gap-2 rounded-lg border border-white/5 px-2.5 py-2 text-[12px]">
          <code className="min-w-0 flex-1 truncate text-white/75">{f.path}</code>
          <span className="font-mono text-[var(--sazabi-crimson)]">{f.incidents}</span>
          <span className="text-[10px] text-white/35">{f.lastAt}</span>
        </div>
      ))}
    </div>
  );
}

export function DependencyAlert({
  data,
}: {
  data: { package: string; severity: string; cve?: string; fixPr?: string; summary: string };
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px] text-white">{data.package}</code>
        <span className="rounded bg-[var(--sazabi-crimson)]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--sazabi-crimson)]">
          {data.severity}
        </span>
        {data.cve && <span className="font-mono text-[10px] text-white/40">{data.cve}</span>}
      </div>
      <p className="text-[12px] text-white/65">{data.summary}</p>
      {data.fixPr && (
        <span className="inline-block rounded border border-[var(--sazabi-hash)]/30 bg-[var(--sazabi-hash)]/10 px-2 py-1 font-mono text-[11px] text-[var(--sazabi-hash)]">
          fix {data.fixPr}
        </span>
      )}
    </div>
  );
}

export function ReleaseTrain({
  data,
}: {
  data: { target: string; blockers: Array<{ pr: number; title: string; missing: string[] }> };
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-white/50">
        Blocking <span className="text-white">{data.target}</span>
      </p>
      {data.blockers.map((b) => (
        <div key={b.pr} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-[12px]">
          <p className="text-white">
            <span className="font-mono text-[var(--sazabi-hash)]">#{b.pr}</span> {b.title}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {b.missing.map((m) => (
              <span key={m} className="rounded bg-[var(--sazabi-warn)]/15 px-1.5 py-0.5 text-[10px] text-[var(--sazabi-warn)]">
                needs {m}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkflowStrip({
  data,
}: {
  data: { name: string; steps: Array<{ name: string; status: 'queued' | 'running' | 'pass' | 'fail' }> };
}) {
  const colors = {
    queued: 'bg-white/15',
    running: 'bg-[var(--sazabi-hash)] animate-pulse',
    pass: 'bg-[var(--sazabi-ok)]',
    fail: 'bg-[var(--sazabi-crimson)]',
  };
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-white">{data.name}</p>
      <div className="flex items-center gap-1">
        {data.steps.map((s, i) => (
          <div key={s.name} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <div className={cn('h-2 w-full rounded-full', colors[s.status])} title={`${s.name}: ${s.status}`} />
            <span className="truncate text-[9px] text-white/35">{s.name}</span>
            {i < data.steps.length - 1 ? null : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrChip({
  data,
}: {
  data: { prs: Array<{ number: number; title: string; checks: Array<'pass' | 'fail' | 'pending'> }> };
}) {
  const dot = { pass: 'bg-[var(--sazabi-ok)]', fail: 'bg-[var(--sazabi-crimson)]', pending: 'bg-[var(--sazabi-warn)]' };
  return (
    <div className="flex flex-wrap gap-2">
      {data.prs.map((p) => (
        <div key={p.number} className="flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
          <span className="font-mono text-[11px] text-[var(--sazabi-hash)]">#{p.number}</span>
          <span className="truncate text-[11px] text-white/80">{p.title}</span>
          <span className="flex gap-0.5">
            {p.checks.map((c, i) => (
              <i key={i} className={cn('size-1.5 rounded-full', dot[c])} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
