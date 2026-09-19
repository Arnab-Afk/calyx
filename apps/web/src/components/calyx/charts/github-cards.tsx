'use client';

import { cn } from '@/lib/utils';
import { FooterMeta, MetricTile, MetricValue, MicroLabel, Subcard, TrendPill, VerticalTicks } from './chart-ui';

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
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-white/5 px-2 py-1 font-mono text-[12px] text-[var(--sazabi-hash)]">#{data.number}</span>
          <TrendPill>@{data.author}</TrendPill>
        </div>
        <p className="mt-3 font-[family-name:var(--font-display)] text-[18px] font-semibold leading-snug text-white">{data.title}</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="Files" value={String(data.files)} />
        <MetricTile label="Added" value={`+${data.additions}`} tone="ok" />
        <MetricTile label="Removed" value={`−${data.deletions}`} tone="error" />
      </div>
      {data.sensitive.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.sensitive.map((s) => (
            <TrendPill key={s} tone="warn">
              touches {s}
            </TrendPill>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {data.checks.map((c) => (
          <span key={c.name} className="inline-flex items-center gap-2 rounded-xl bg-black/35 px-3 py-2 text-[12px] text-white/65">
            <i className={cn('size-2 rounded-full', statusDot[c.status])} />
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
    <div className="space-y-5">
      <div>
        <MicroLabel>{data.workflow}</MicroLabel>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="font-[family-name:var(--font-display)] text-[18px] font-semibold text-white">{data.job}</p>
          <TrendPill tone={data.verdict === 'flake' ? 'warn' : 'error'}>
            {data.verdict === 'flake' ? 'likely flake' : 'real failure'}
          </TrendPill>
        </div>
      </div>
      <pre className="max-h-40 overflow-auto rounded-2xl border border-white/10 bg-black/45 p-4 font-mono text-[12px] leading-relaxed text-[#ffb0b8]">
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="rounded-2xl bg-[var(--sazabi-crimson)]/15 px-4 py-4 text-center">
          <MicroLabel>Commit</MicroLabel>
          <p className="mt-1 font-mono text-[16px] text-[#ffb0b8]">{data.sha.slice(0, 7)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-display)] text-[17px] font-semibold leading-snug text-white">{data.message}</p>
          <p className="mt-2 text-[13px] text-white/45">
            → <span className="text-white/85">{data.env}</span>
          </p>
          <p className="mt-1 text-[13px] text-[var(--sazabi-ok)]">{data.status}</p>
        </div>
      </div>
      <FooterMeta
        items={[
          { label: 'Merged by', value: data.by },
          { label: 'When', value: data.at },
          { label: 'Env', value: data.env },
        ]}
      />
    </div>
  );
}

export function BlameHotspot({
  data,
}: {
  data: { files: Array<{ path: string; incidents: number; lastAt: string }> };
}) {
  const max = Math.max(...data.files.map((f) => f.incidents), 1);
  return (
    <div className="space-y-5">
      <div>
        <MicroLabel>Hotspots · 30d</MicroLabel>
        <div className="mt-2">
          <MetricValue size="xl">{data.files.reduce((s, f) => s + f.incidents, 0)}</MetricValue>
        </div>
        <p className="mt-1 text-[13px] text-white/40">incidents across files</p>
      </div>
      <div className="space-y-4">
        {data.files.map((f) => (
          <div key={f.path}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <code className="truncate font-mono text-[13px] text-white/80">{f.path}</code>
              <span className="font-[family-name:var(--font-display)] text-[15px] text-[var(--sazabi-crimson)]">{f.incidents}</span>
            </div>
            <VerticalTicks value={f.incidents} max={max} ticks={24} color="#e11d2e" className="h-7" />
            <p className="mt-1 text-[11px] text-white/30">last {f.lastAt}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DependencyAlert({
  data,
}: {
  data: { package: string; severity: string; cve?: string; fixPr?: string; summary: string };
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-xl bg-black/40 px-3 py-1.5 font-mono text-[14px] text-white">{data.package}</code>
        <TrendPill tone="error">{data.severity}</TrendPill>
        {data.cve && <span className="font-mono text-[12px] text-white/40">{data.cve}</span>}
      </div>
      <p className="text-[15px] leading-relaxed text-white/70">{data.summary}</p>
      {data.fixPr && (
        <span className="inline-block rounded-xl border border-[var(--sazabi-hash)]/30 bg-[var(--sazabi-hash)]/10 px-3 py-2 font-mono text-[13px] text-[var(--sazabi-hash)]">
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
    <div className="space-y-5">
      <div>
        <MicroLabel>Release train</MicroLabel>
        <p className="mt-2 font-[family-name:var(--font-display)] text-[20px] font-semibold text-white">{data.target}</p>
        <p className="mt-1 text-[13px] text-white/40">{data.blockers.length} blockers</p>
      </div>
      <div className="space-y-3">
        {data.blockers.map((b) => (
          <Subcard key={b.pr} className="py-4">
            <p className="text-[14px] text-white">
              <span className="font-mono text-[var(--sazabi-hash)]">#{b.pr}</span> {b.title}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {b.missing.map((m) => (
                <TrendPill key={m} tone="warn">
                  needs {m}
                </TrendPill>
              ))}
            </div>
          </Subcard>
        ))}
      </div>
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
    <div className="space-y-5">
      <p className="font-[family-name:var(--font-display)] text-[16px] font-semibold text-white">{data.name}</p>
      <div className="flex items-end gap-2">
        {data.steps.map((s) => (
          <div key={s.name} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className={cn('h-3 w-full rounded-full', colors[s.status])} title={`${s.name}: ${s.status}`} />
            <span className="truncate text-[11px] uppercase tracking-wide text-white/40">{s.name}</span>
            <span className="text-[10px] capitalize text-white/30">{s.status}</span>
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
    <div className="space-y-3">
      {data.prs.map((p) => (
        <div
          key={p.number}
          className="flex max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3.5"
        >
          <span className="font-mono text-[13px] text-[var(--sazabi-hash)]">#{p.number}</span>
          <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-display)] text-[14px] text-white/90">{p.title}</span>
          <span className="flex gap-1">
            {p.checks.map((c, i) => (
              <i key={i} className={cn('size-2 rounded-full', dot[c])} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export type DiffLine = {
  type: 'add' | 'del' | 'ctx';
  content: string;
  oldNo?: number | null;
  newNo?: number | null;
};

/** GitHub-style commit / file diff snapshot in-thread. */
export function CommitDiff({
  data,
}: {
  data: {
    sha: string;
    message: string;
    author: string;
    path: string;
    additions?: number;
    deletions?: number;
    hunkHeader?: string;
    lines: DiffLine[];
  };
}) {
  const adds = data.additions ?? data.lines.filter((l) => l.type === 'add').length;
  const dels = data.deletions ?? data.lines.filter((l) => l.type === 'del').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[var(--sazabi-crimson)]/15 px-2.5 py-1 font-mono text-[12px] text-[#ffb0b8]">
              {data.sha.slice(0, 7)}
            </span>
            <span className="text-[12px] text-white/40">@{data.author}</span>
          </div>
          <p className="mt-2 font-[family-name:var(--font-display)] text-[16px] font-semibold leading-snug text-white">
            {data.message}
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[12px]">
          <span className="text-[var(--sazabi-ok)]">+{adds}</span>
          <span className="text-[var(--sazabi-crimson)]">−{dels}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d1117] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
          <code className="font-mono text-[12px] text-white/70">{data.path}</code>
          <span className="font-mono text-[11px] text-white/35">
            <span className="text-[var(--sazabi-ok)]">+{adds}</span>
            {' · '}
            <span className="text-[var(--sazabi-crimson)]">−{dels}</span>
          </span>
        </div>

        {data.hunkHeader ? (
          <div className="border-b border-white/[0.04] bg-[#161b22] px-4 py-1.5 font-mono text-[11px] text-[#79c0ff]">
            {data.hunkHeader}
          </div>
        ) : null}

        <div className="overflow-x-auto font-mono text-[12px] leading-[1.55]">
          {data.lines.map((line, i) => {
            const isAdd = line.type === 'add';
            const isDel = line.type === 'del';
            return (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-[2.75rem_2.75rem_1.25rem_1fr] items-stretch',
                  isAdd && 'bg-[rgba(46,160,67,0.18)]',
                  isDel && 'bg-[rgba(248,81,73,0.18)]',
                  !isAdd && !isDel && 'bg-transparent hover:bg-white/[0.02]',
                )}
              >
                <span
                  className={cn(
                    'select-none border-r border-white/[0.04] px-2 text-right tabular-nums text-white/25',
                    isDel && 'text-[#ff8182]/70',
                  )}
                >
                  {line.oldNo ?? ''}
                </span>
                <span
                  className={cn(
                    'select-none border-r border-white/[0.04] px-2 text-right tabular-nums text-white/25',
                    isAdd && 'text-[#7ee787]/70',
                  )}
                >
                  {line.newNo ?? ''}
                </span>
                <span
                  className={cn(
                    'select-none text-center',
                    isAdd && 'text-[#3dd68c]',
                    isDel && 'text-[#ff6b6b]',
                    !isAdd && !isDel && 'text-white/20',
                  )}
                >
                  {isAdd ? '+' : isDel ? '−' : ' '}
                </span>
                <span
                  className={cn(
                    'whitespace-pre px-2 pr-4',
                    isAdd && 'text-[#aff5b4]',
                    isDel && 'text-[#ffdcd7]',
                    !isAdd && !isDel && 'text-[#c9d1d9]/90',
                  )}
                >
                  {line.content || ' '}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
