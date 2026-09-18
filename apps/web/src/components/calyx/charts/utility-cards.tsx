'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

/* ─── Shared primitives ─────────────────────────────────────────── */

export function ActionCard({
  data,
}: {
  data: {
    title: string;
    why: string;
    risk: 'low' | 'medium' | 'high';
    steps: string[];
    reversible?: boolean;
  };
}) {
  const [phase, setPhase] = useState<'idle' | 'dry' | 'done' | 'undone'>('idle');
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-white">{data.title}</p>
          <p className="mt-1 text-[12px] text-white/55">{data.why}</p>
        </div>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            data.risk === 'high' && 'bg-[var(--sazabi-crimson)]/25 text-[var(--sazabi-crimson)]',
            data.risk === 'medium' && 'bg-[var(--sazabi-warn)]/20 text-[var(--sazabi-warn)]',
            data.risk === 'low' && 'bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]',
          )}
        >
          {data.risk}
        </span>
      </div>
      {(phase === 'dry' || phase === 'done') && (
        <ul className="space-y-1 rounded-lg border border-white/10 bg-black/30 p-2.5 font-mono text-[11px] text-[#c8f0d8]">
          {data.steps.map((s) => (
            <li key={s}>+ {s}</li>
          ))}
        </ul>
      )}
      {phase === 'done' && <p className="text-[12px] text-[var(--sazabi-ok)]">Executed</p>}
      {phase === 'undone' && <p className="text-[12px] text-white/45">Undone</p>}
      <div className="flex gap-2">
        {phase === 'idle' && (
          <button type="button" onClick={() => setPhase('dry')} className="sazabi-btn-ghost rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
            Dry-run
          </button>
        )}
        {(phase === 'dry' || phase === 'idle') && (
          <button type="button" onClick={() => setPhase('done')} className="sazabi-btn-primary rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
            Run
          </button>
        )}
        {phase === 'done' && data.reversible !== false && (
          <button type="button" onClick={() => setPhase('undone')} className="sazabi-btn-ghost rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

export function DataTable({
  data,
}: {
  data: { columns: string[]; rows: Array<Array<string | number>>; caption?: string };
}) {
  const [sortCol, setSortCol] = useState(0);
  const [asc, setAsc] = useState(false);
  const sorted = useMemo(() => {
    const copy = [...data.rows];
    copy.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av;
      return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [data.rows, sortCol, asc]);

  return (
    <div className="overflow-x-auto">
      {data.caption && <p className="mb-2 text-[11px] text-white/40">{data.caption}</p>}
      <table className="w-full min-w-[320px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-white/10 text-white/45">
            {data.columns.map((c, i) => (
              <th key={c} className="px-2 py-1.5 font-medium">
                <button
                  type="button"
                  className="hover:text-white"
                  onClick={() => {
                    if (sortCol === i) setAsc((v) => !v);
                    else {
                      setSortCol(i);
                      setAsc(false);
                    }
                  }}
                >
                  {c}
                  {sortCol === i ? (asc ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri} className="border-b border-white/[0.05] text-white/80">
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1.5 font-mono text-[11px]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MetricChips({
  data,
}: {
  data: { chips: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'error' | 'info' | 'neutral'; source?: string }> };
}) {
  const toneClass = {
    ok: 'border-[var(--sazabi-ok)]/40 text-[var(--sazabi-ok)]',
    warn: 'border-[var(--sazabi-warn)]/40 text-[var(--sazabi-warn)]',
    error: 'border-[var(--sazabi-crimson)]/40 text-[var(--sazabi-crimson)]',
    info: 'border-[var(--sazabi-hash)]/40 text-[var(--sazabi-hash)]',
    neutral: 'border-white/15 text-white/70',
  };
  return (
    <div className="flex flex-wrap gap-2">
      {data.chips.map((c) => (
        <div
          key={c.label + c.value}
          className={cn('rounded-lg border bg-black/30 px-2.5 py-1.5', toneClass[c.tone ?? 'neutral'])}
        >
          <p className="text-[9px] uppercase tracking-wider opacity-70">{c.label}</p>
          <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-white">{c.value}</p>
          {c.source && <p className="text-[9px] text-white/35">via {c.source}</p>}
        </div>
      ))}
    </div>
  );
}

export function DiffCard({
  data,
}: {
  data: { title: string; before: string; after: string; path?: string };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="font-medium text-white">{data.title}</span>
        {data.path && <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/50">{data.path}</code>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#2a1216] p-2.5 font-mono text-[11px] text-[#ffb0b8]">
          <span className="mb-1 block text-[9px] uppercase text-white/35">before</span>
          {data.before}
        </pre>
        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#122a1a] p-2.5 font-mono text-[11px] text-[#c8f0d8]">
          <span className="mb-1 block text-[9px] uppercase text-white/35">after</span>
          {data.after}
        </pre>
      </div>
    </div>
  );
}

/* ─── Starter pack ──────────────────────────────────────────────── */

export function UptimePulse({
  data,
}: {
  data: { url: string; up: boolean; latencyMs: number; strip: Array<'up' | 'degraded' | 'down'>; uptimePct: number };
}) {
  const color = { up: 'bg-[var(--sazabi-ok)]', degraded: 'bg-[var(--sazabi-warn)]', down: 'bg-[var(--sazabi-crimson)]' };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('size-2.5 rounded-full', data.up ? 'bg-[var(--sazabi-ok)]' : 'bg-[var(--sazabi-crimson)]')} />
          <span className="font-mono text-[12px] text-white/80">{data.url}</span>
        </div>
        <span className="font-[family-name:var(--font-display)] text-sm text-white">{data.uptimePct.toFixed(2)}%</span>
      </div>
      <div className="flex h-6 gap-[2px]">
        {data.strip.map((s, i) => (
          <div key={i} className={cn('min-w-0 flex-1 rounded-[2px]', color[s])} title={s} />
        ))}
      </div>
      <p className="text-[11px] text-white/40">Last check {data.latencyMs}ms · last 24h</p>
    </div>
  );
}

export function ErrorDigest({
  data,
}: {
  data: { period: string; items: Array<{ plain: string; count: number; route?: string }> };
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-white/40">Top errors · {data.period}</p>
      {data.items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2">
          <span className="w-4 text-[11px] text-white/30">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-white">{item.plain}</p>
            {item.route && <p className="font-mono text-[10px] text-white/35">{item.route}</p>}
          </div>
          <span className="font-mono text-[12px] text-[var(--sazabi-crimson)]">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

export function SlowPages({
  data,
}: {
  data: { pages: Array<{ path: string; p95Ms: number }> };
}) {
  const max = Math.max(...data.pages.map((p) => p.p95Ms), 1);
  return (
    <div className="space-y-2">
      {data.pages.map((p) => (
        <div key={p.path} className="grid grid-cols-[1fr_48px] items-center gap-2">
          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <code className="text-white/80">{p.path}</code>
              <span className="font-mono text-white/50">{p.p95Ms}ms</span>
            </div>
            <div className="h-2 rounded-full bg-white/5">
              <div
                className="h-2 rounded-full bg-[var(--sazabi-crimson)]/80"
                style={{ width: `${(p.p95Ms / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserPainFeed({
  data,
}: {
  data: { items: Array<{ user: string; error: string; when: string; count: number }> };
}) {
  return (
    <div className="space-y-2">
      {data.items.map((item, i) => (
        <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{item.user}</span>
            <span className="text-white/35">{item.when}</span>
            <span className="ml-auto font-mono text-[var(--sazabi-crimson)]">×{item.count}</span>
          </div>
          <p className="mt-0.5 text-white/60">{item.error}</p>
        </div>
      ))}
    </div>
  );
}

export function FeatureFlags({
  data,
}: {
  data: { flags: Array<{ key: string; on: boolean; by: string; at: string }> };
}) {
  return (
    <div className="space-y-1.5">
      {data.flags.map((f) => (
        <div key={f.key} className="flex items-center gap-2 rounded-lg border border-white/5 px-2.5 py-2 text-[12px]">
          <span className={cn('size-2 rounded-full', f.on ? 'bg-[var(--sazabi-ok)]' : 'bg-white/20')} />
          <code className="text-white/85">{f.key}</code>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', f.on ? 'bg-[var(--sazabi-ok)]/15 text-[var(--sazabi-ok)]' : 'bg-white/5 text-white/40')}>
            {f.on ? 'on' : 'off'}
          </span>
          <span className="ml-auto text-[10px] text-white/35">
            {f.by} · {f.at}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReleaseNotes({
  data,
}: {
  data: { version: string; shippedAt: string; items: string[] };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[var(--sazabi-crimson)]/20 px-2 py-0.5 font-[family-name:var(--font-display)] text-[12px] font-semibold text-[#ffb0b8]">
          {data.version}
        </span>
        <span className="text-[11px] text-white/40">shipped {data.shippedAt}</span>
      </div>
      <ul className="space-y-1 text-[12px] text-white/70">
        {data.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-[var(--sazabi-ok)]">+</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function QueueBacklog({
  data,
}: {
  data: { queue: string; failed: number; oldestAge: string; samples: string[] };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-[12px] text-white/70">{data.queue}</p>
          <p className="text-[11px] text-white/40">oldest {data.oldestAge}</p>
        </div>
        <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--sazabi-crimson)]">{data.failed}</p>
      </div>
      <ul className="space-y-1 rounded-lg bg-black/30 p-2 font-mono text-[10px] text-white/50">
        {data.samples.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

export function DbBasics({
  data,
}: {
  data: { connections: number; maxConnections: number; slowQueries: Array<{ sql: string; ms: number }>; migration: string };
}) {
  const pct = (data.connections / data.maxConnections) * 100;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-white/50">
          <span>Connections</span>
          <span className="font-mono text-white/80">
            {data.connections}/{data.maxConnections}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/5">
          <div className={cn('h-2 rounded-full', pct > 80 ? 'bg-[var(--sazabi-crimson)]' : 'bg-[var(--sazabi-ok)]')} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="text-[11px] text-white/40">
        Migrations: <span className="text-white/70">{data.migration}</span>
      </p>
      <div className="space-y-1">
        {data.slowQueries.map((q) => (
          <div key={q.sql} className="flex justify-between gap-2 rounded bg-black/30 px-2 py-1.5 font-mono text-[10px]">
            <span className="truncate text-white/60">{q.sql}</span>
            <span className="text-[var(--sazabi-warn)]">{q.ms}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuthHiccups({
  data,
}: {
  data: { failedLogins: number; oauthErrors: Array<{ provider: string; count: number }>; period: string };
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <p className="text-[11px] text-white/40">Failed logins · {data.period}</p>
        <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--sazabi-warn)]">{data.failedLogins}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {data.oauthErrors.map((o) => (
          <span key={o.provider} className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px]">
            <span className="text-white/50">{o.provider}</span>{' '}
            <span className="font-semibold text-white">{o.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function EmailDeliverability({
  data,
}: {
  data: { bounceRate: number; provider: string; status: string; sent: number };
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-lg bg-white/[0.03] px-2 py-3">
        <p className="text-[10px] text-white/40">Bounce</p>
        <p className={cn('text-lg font-semibold', data.bounceRate > 5 ? 'text-[var(--sazabi-crimson)]' : 'text-white')}>
          {data.bounceRate}%
        </p>
      </div>
      <div className="rounded-lg bg-white/[0.03] px-2 py-3">
        <p className="text-[10px] text-white/40">Sent</p>
        <p className="text-lg font-semibold text-white">{data.sent}</p>
      </div>
      <div className="rounded-lg bg-white/[0.03] px-2 py-3">
        <p className="text-[10px] text-white/40">{data.provider}</p>
        <p className="text-lg font-semibold text-[var(--sazabi-ok)]">{data.status}</p>
      </div>
    </div>
  );
}

export function MorningDigest({
  data,
}: {
  data: { greeting: string; bullets: Array<{ icon: string; text: string }> };
}) {
  return (
    <div className="space-y-2">
      <p className="font-[family-name:var(--font-display)] text-[14px] text-white">{data.greeting}</p>
      <ul className="space-y-1.5">
        {data.bullets.map((b) => (
          <li key={b.text} className="flex gap-2 text-[12px] text-white/70">
            <span className="text-white/40">{b.icon}</span>
            {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IncidentLite({
  data,
}: {
  data: { title: string; severity: string; owner: string; checklist: Array<{ done: boolean; text: string }> };
}) {
  const [items, setItems] = useState(data.checklist);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-[var(--sazabi-crimson)]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--sazabi-crimson)]">
          {data.severity}
        </span>
        <span className="text-[13px] font-medium text-white">{data.title}</span>
        <span className="ml-auto text-[11px] text-white/40">owner {data.owner}</span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={item.text}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-white/5"
              onClick={() =>
                setItems((prev) => prev.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))
              }
            >
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded border text-[10px]',
                  item.done ? 'border-[var(--sazabi-ok)] bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]' : 'border-white/20 text-transparent',
                )}
              >
                ✓
              </span>
              <span className={cn(item.done && 'text-white/35 line-through')}>{item.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunbookChecklist({
  data,
}: {
  data: { name: string; steps: string[] };
}) {
  const [done, setDone] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-2">
      <p className="font-[family-name:var(--font-display)] text-[13px] text-white">{data.name}</p>
      <ol className="space-y-1">
        {data.steps.map((step, i) => (
          <li key={step}>
            <button
              type="button"
              onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-white/5"
            >
              <span className="mt-0.5 font-mono text-[10px] text-white/30">{i + 1}.</span>
              <span className={cn(done[i] && 'text-white/35 line-through')}>{step}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
