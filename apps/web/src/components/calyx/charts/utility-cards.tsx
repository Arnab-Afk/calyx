'use client';

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Check, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FooterMeta,
  MetricTile,
  MetricValue,
  MicroLabel,
  SplitPillBar,
  StatRow,
  Subcard,
  TrendPill,
  VerticalTicks,
} from './chart-ui';

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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-display)] text-[18px] font-semibold tracking-tight text-white">
            {data.title}
          </p>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-white/55">{data.why}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]',
            data.risk === 'high' && 'bg-[var(--sazabi-crimson)]/25 text-[var(--sazabi-crimson)]',
            data.risk === 'medium' && 'bg-[var(--sazabi-warn)]/20 text-[var(--sazabi-warn)]',
            data.risk === 'low' && 'bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]',
          )}
        >
          {data.risk} risk
        </span>
      </div>
      {(phase === 'dry' || phase === 'done') && (
        <ul className="space-y-2 rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-[#c8f0d8]">
          {data.steps.map((s) => (
            <li key={s}>+ {s}</li>
          ))}
        </ul>
      )}
      {phase === 'done' && <p className="text-[13px] text-[var(--sazabi-ok)]">Executed</p>}
      {phase === 'undone' && <p className="text-[13px] text-white/45">Undone</p>}
      <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
        {phase === 'idle' && (
          <button
            type="button"
            onClick={() => setPhase('dry')}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80 transition hover:border-white/25 hover:text-white"
          >
            Dry-run
          </button>
        )}
        {(phase === 'dry' || phase === 'idle') && (
          <button
            type="button"
            onClick={() => setPhase('done')}
            className="rounded-xl bg-[var(--sazabi-crimson)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-white shadow-[0_0_24px_var(--sazabi-crimson-glow)] transition hover:brightness-110"
          >
            Run
          </button>
        )}
        {phase === 'done' && data.reversible !== false && (
          <button
            type="button"
            onClick={() => setPhase('undone')}
            className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/80"
          >
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
      {data.caption && <p className="mb-3 text-[13px] text-white/45">{data.caption}</p>}
      <table className="w-full min-w-[360px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b border-white/10 text-white/40">
            {data.columns.map((c, i) => (
              <th key={c} className="px-3 py-3 font-[family-name:var(--font-body)] text-[11px] font-medium uppercase tracking-[0.12em]">
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
            <tr key={ri} className="border-b border-white/[0.05] text-white/80 transition hover:bg-white/[0.02]">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-3 font-mono text-[12px]">
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
  const primary = data.chips[0];
  return (
    <div className="space-y-5">
      {primary && (
        <div>
          <MicroLabel className={cn(
            primary.tone === 'ok' && 'text-[var(--sazabi-ok)]',
            primary.tone === 'warn' && 'text-[var(--sazabi-warn)]',
            primary.tone === 'error' && 'text-[var(--sazabi-crimson)]',
          )}>
            {primary.label}
          </MicroLabel>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <MetricValue size="2xl">{primary.value}</MetricValue>
            {primary.source ? (
              <TrendPill tone={primary.tone === 'ok' ? 'ok' : 'neutral'}>via {primary.source}</TrendPill>
            ) : null}
          </div>
          <p className="mt-3 max-w-md text-[13px] text-white/40">Live snapshot across probes, logs, and deploys.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.chips.map((c) => (
          <MetricTile
            key={c.label + c.value}
            label={c.label}
            value={c.value}
            hint={c.source ? `via ${c.source}` : undefined}
            tone={c.tone ?? 'neutral'}
          />
        ))}
      </div>
    </div>
  );
}

export function DiffCard({
  data,
}: {
  data: { title: string; before: string; after: string; path?: string };
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-[family-name:var(--font-display)] text-[16px] font-semibold text-white">{data.title}</p>
        {data.path && (
          <code className="rounded-lg bg-black/40 px-2.5 py-1 font-mono text-[11px] text-white/50">{data.path}</code>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <pre className="min-h-[7rem] overflow-x-auto rounded-2xl border border-[var(--sazabi-crimson)]/25 bg-[#2a1216]/80 p-4 font-mono text-[12px] leading-relaxed text-[#ffb0b8]">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-white/35">before</span>
          {data.before}
        </pre>
        <pre className="min-h-[7rem] overflow-x-auto rounded-2xl border border-[var(--sazabi-ok)]/25 bg-[#122a1a]/80 p-4 font-mono text-[12px] leading-relaxed text-[#c8f0d8]">
          <span className="mb-2 block text-[10px] uppercase tracking-[0.14em] text-white/35">after</span>
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <MicroLabel>Uptime pulse</MicroLabel>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <MetricValue size="2xl">{data.uptimePct.toFixed(2)}%</MetricValue>
            <TrendPill tone={data.up ? 'ok' : 'error'}>{data.up ? '↗ Up' : '↘ Down'}</TrendPill>
          </div>
          <p className="mt-2 font-mono text-[13px] text-white/50">{data.url}</p>
        </div>
        <Subcard className="min-w-[8rem] px-4 py-3 text-center">
          <MicroLabel>Latency</MicroLabel>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-white">{data.latencyMs}ms</p>
        </Subcard>
      </div>

      <div>
        <MicroLabel className="mb-2">Last 24h</MicroLabel>
        <div className="flex h-11 gap-[3px]">
          {data.strip.map((s, i) => (
            <div key={i} className={cn('min-w-0 flex-1 rounded-sm', color[s])} title={s} />
          ))}
        </div>
      </div>

      <SplitPillBar
        left={{
          label: 'Healthy',
          pct: data.uptimePct,
          color: 'rgba(61, 214, 140, 0.18)',
          textColor: 'var(--sazabi-ok)',
        }}
        right={{
          label: 'Degraded',
          pct: 100 - data.uptimePct,
          color: 'rgba(255,255,255,0.06)',
          textColor: 'rgba(255,255,255,0.55)',
        }}
      />

      <FooterMeta
        items={[
          { label: 'Status', value: data.up ? 'Reachable' : 'Unreachable' },
          { label: 'Check', value: `${data.latencyMs}ms` },
          { label: 'Window', value: '24 hours' },
        ]}
      />
    </div>
  );
}

export function ErrorDigest({
  data,
}: {
  data: { period: string; items: Array<{ plain: string; count: number; route?: string }> };
}) {
  const total = data.items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <MicroLabel>Error digest · {data.period}</MicroLabel>
          <div className="mt-2">
            <MetricValue size="xl">{total}</MetricValue>
          </div>
          <p className="mt-2 text-[13px] text-white/40">Top errors in plain language</p>
        </div>
      </div>
      <div>
        {data.items.map((item, i) => (
          <StatRow
            key={i}
            value={String(item.count)}
            label={item.plain}
            delta={item.route}
            positive={false}
          />
        ))}
      </div>
    </div>
  );
}

export function SlowPages({
  data,
}: {
  data: { pages: Array<{ path: string; p95Ms: number }> };
}) {
  const max = Math.max(...data.pages.map((p) => p.p95Ms), 1);
  const worst = data.pages[0];
  return (
    <div className="space-y-5">
      {worst && (
        <div>
          <MicroLabel>Slowest p95</MicroLabel>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <MetricValue size="2xl">{worst.p95Ms}ms</MetricValue>
            <code className="rounded-lg bg-black/40 px-2 py-1 font-mono text-[12px] text-white/50">{worst.path}</code>
          </div>
        </div>
      )}
      <div className="space-y-4">
        {data.pages.map((p) => (
          <div key={p.path}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <code className="font-mono text-[13px] text-white/80">{p.path}</code>
              <span className="font-[family-name:var(--font-display)] text-[15px] tabular-nums text-white">{p.p95Ms}ms</span>
            </div>
            <VerticalTicks value={p.p95Ms} max={max} ticks={28} color="#e11d2e" className="h-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserPainFeed({
  data,
}: {
  data: { items: Array<{ user: string; error: string; when: string; count: number }> };
}) {
  const total = data.items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="space-y-5">
      <div>
        <MicroLabel>User pain</MicroLabel>
        <div className="mt-2 flex items-center gap-3">
          <MetricValue size="xl">{total}</MetricValue>
          <span className="text-[13px] text-white/40">hits in window</span>
        </div>
      </div>
      <div className="space-y-3">
        {data.items.map((item, i) => (
          <Subcard key={i} className="flex items-start gap-4 py-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sazabi-crimson)]/15 font-[family-name:var(--font-display)] text-sm font-semibold text-[var(--sazabi-crimson)]">
              ×{item.count}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-[family-name:var(--font-display)] text-[14px] text-white">{item.user}</span>
                <span className="text-[12px] text-white/35">{item.when}</span>
              </div>
              <p className="mt-1 text-[13px] leading-snug text-white/60">{item.error}</p>
            </div>
          </Subcard>
        ))}
      </div>
    </div>
  );
}

export function FeatureFlags({
  data,
}: {
  data: { flags: Array<{ key: string; on: boolean; by: string; at: string }> };
}) {
  const onCount = data.flags.filter((f) => f.on).length;
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <MicroLabel>Feature flags</MicroLabel>
          <div className="mt-2">
            <MetricValue size="xl">
              {onCount}/{data.flags.length}
            </MetricValue>
          </div>
          <p className="mt-1 text-[13px] text-white/40">currently enabled</p>
        </div>
      </div>
      <SplitPillBar
        left={{ label: 'On', pct: (onCount / Math.max(data.flags.length, 1)) * 100, color: 'rgba(61,214,140,0.2)', textColor: 'var(--sazabi-ok)' }}
        right={{ label: 'Off', pct: ((data.flags.length - onCount) / Math.max(data.flags.length, 1)) * 100 }}
      />
      <div className="space-y-2">
        {data.flags.map((f) => (
          <div
            key={f.key}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
          >
            <span className={cn('size-2.5 rounded-full', f.on ? 'bg-[var(--sazabi-ok)] shadow-[0_0_8px_var(--sazabi-ok)]' : 'bg-white/25')} />
            <code className="font-mono text-[13px] text-white/90">{f.key}</code>
            <TrendPill tone={f.on ? 'ok' : 'neutral'}>{f.on ? 'on' : 'off'}</TrendPill>
            <span className="ml-auto text-[12px] text-white/35">
              {f.by} · {f.at}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReleaseNotes({
  data,
}: {
  data: { version: string; shippedAt: string; items: string[] };
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-xl bg-[var(--sazabi-crimson)]/20 px-3 py-1.5 font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#ffb0b8]">
          {data.version}
        </span>
        <span className="text-[13px] text-white/40">shipped {data.shippedAt}</span>
      </div>
      <ul className="space-y-3">
        {data.items.map((item) => (
          <li key={item} className="flex gap-3 border-b border-white/[0.05] pb-3 text-[14px] text-white/75 last:border-0">
            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-[var(--sazabi-ok)]" />
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <MicroLabel>{data.queue}</MicroLabel>
          <div className="mt-2 flex items-center gap-3">
            <MetricValue size="2xl" className="text-[var(--sazabi-crimson)]">
              {data.failed}
            </MetricValue>
            <TrendPill tone="error">failed jobs</TrendPill>
          </div>
          <p className="mt-2 text-[13px] text-white/40">Oldest failure {data.oldestAge}</p>
        </div>
      </div>
      <VerticalTicks value={Math.min(100, data.failed * 8)} ticks={32} color="#e11d2e" />
      <ul className="space-y-2 rounded-2xl border border-white/[0.06] bg-black/35 p-4 font-mono text-[12px] text-white/55">
        {data.samples.map((s) => (
          <li key={s} className="truncate">
            {s}
          </li>
        ))}
      </ul>
      <FooterMeta
        items={[
          { label: 'Queue', value: data.queue },
          { label: 'Failed', value: String(data.failed) },
          { label: 'Oldest', value: data.oldestAge },
        ]}
      />
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <MicroLabel>Connections</MicroLabel>
          <div className="mt-2">
            <MetricValue size="2xl">
              {data.connections}
              <span className="text-2xl text-white/30">/{data.maxConnections}</span>
            </MetricValue>
          </div>
        </div>
        <TrendPill tone={pct > 80 ? 'error' : 'ok'}>{pct.toFixed(0)}% used</TrendPill>
      </div>
      <VerticalTicks value={pct} ticks={36} color={pct > 80 ? '#e11d2e' : '#3dd68c'} />
      <SplitPillBar
        left={{ label: 'Active', pct, color: pct > 80 ? 'rgba(225,29,46,0.25)' : 'rgba(61,214,140,0.2)', textColor: pct > 80 ? '#ff6b6b' : 'var(--sazabi-ok)' }}
        right={{ label: 'Idle', pct: 100 - pct }}
      />
      <p className="text-[13px] text-white/45">
        Migrations: <span className="text-white/80">{data.migration}</span>
      </p>
      <div className="space-y-2">
        <MicroLabel>Slow queries</MicroLabel>
        {data.slowQueries.map((q) => (
          <div
            key={q.sql}
            className="flex items-center justify-between gap-3 rounded-xl bg-black/35 px-4 py-3 font-mono text-[12px]"
          >
            <span className="truncate text-white/60">{q.sql}</span>
            <span className="shrink-0 text-[var(--sazabi-warn)]">{q.ms}ms</span>
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
    <div className="space-y-5">
      <div>
        <MicroLabel>Failed logins · {data.period}</MicroLabel>
        <div className="mt-2 flex items-center gap-3">
          <MetricValue size="2xl" className="text-[var(--sazabi-warn)]">
            {data.failedLogins}
          </MetricValue>
          <TrendPill tone="warn">spike</TrendPill>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data.oauthErrors.map((o) => (
          <MetricTile key={o.provider} label={o.provider} value={String(o.count)} tone="warn" hint="OAuth errors" />
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
    <div className="space-y-5">
      <div>
        <MicroLabel>Bounce rate</MicroLabel>
        <div className="mt-2 flex items-center gap-3">
          <MetricValue size="2xl" className={data.bounceRate > 5 ? 'text-[var(--sazabi-crimson)]' : undefined}>
            {data.bounceRate}%
          </MetricValue>
          <TrendPill tone={data.bounceRate > 5 ? 'error' : 'ok'}>{data.status}</TrendPill>
        </div>
      </div>
      <VerticalTicks
        value={Math.min(100, data.bounceRate * 10)}
        ticks={30}
        color={data.bounceRate > 5 ? '#e11d2e' : '#3dd68c'}
      />
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Sent" value={String(data.sent)} tone="neutral" />
        <MetricTile label={data.provider} value={data.status} tone="ok" />
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
    <div className="space-y-5">
      <div>
        <MicroLabel>Since you left</MicroLabel>
        <p className="mt-2 font-[family-name:var(--font-display)] text-[22px] font-semibold leading-snug tracking-tight text-white">
          {data.greeting}
        </p>
      </div>
      <ul className="space-y-0">
        {data.bullets.map((b) => (
          <li
            key={b.text}
            className="flex gap-3 border-b border-white/[0.06] py-3.5 text-[14px] leading-snug text-white/75 last:border-0"
          >
            <span className="w-5 shrink-0 text-center text-white/40">{b.icon}</span>
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
  const doneCount = items.filter((i) => i.done).length;
  const pct = (doneCount / Math.max(items.length, 1)) * 100;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--sazabi-crimson)]/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sazabi-crimson)]">
              {data.severity}
            </span>
            <span className="text-[13px] text-white/40">owner {data.owner}</span>
          </div>
          <p className="mt-2 font-[family-name:var(--font-display)] text-[18px] font-semibold text-white">{data.title}</p>
        </div>
        <div className="text-right">
          <MetricValue size="md">{doneCount}/{items.length}</MetricValue>
          <MicroLabel className="mt-1">checklist</MicroLabel>
        </div>
      </div>
      <VerticalTicks value={pct} ticks={24} color="#f0e8ea" />
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={item.text}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] transition hover:bg-white/[0.04]"
              onClick={() => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-md border',
                  item.done
                    ? 'border-[var(--sazabi-ok)] bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]'
                    : 'border-white/20 text-transparent',
                )}
              >
                <Check className="size-3" strokeWidth={3} />
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
  const doneCount = Object.values(done).filter(Boolean).length;
  const pct = (doneCount / Math.max(data.steps.length, 1)) * 100;
  return (
    <div className="space-y-5">
      <div>
        <MicroLabel>Runbook</MicroLabel>
        <p className="mt-2 font-[family-name:var(--font-display)] text-[18px] font-semibold text-white">{data.name}</p>
        <div className="mt-3 flex items-center gap-3">
          <MetricValue size="md">{Math.round(pct)}%</MetricValue>
          <span className="text-[13px] text-white/40">
            {doneCount} of {data.steps.length} steps
          </span>
        </div>
      </div>
      <VerticalTicks value={pct} ticks={28} color="#f0e8ea" />
      <ol className="space-y-1">
        {data.steps.map((step, i) => (
          <li key={step}>
            <button
              type="button"
              onClick={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left text-[14px] transition hover:bg-white/[0.04]"
            >
              <span className="mt-0.5 w-5 font-[family-name:var(--font-display)] text-[12px] text-white/30">{i + 1}</span>
              <span className={cn(done[i] && 'text-white/35 line-through')}>{step}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type ProgressIndicatorData = {
  title?: string;
  insight: string;
  percent: number;
  delta?: number;
  comparison?: string;
};

/** Goal / SLO progress — Joshua Guo progress-indicator layout. */
export function ProgressIndicator({ data }: { data: ProgressIndicatorData }) {
  const title = data.title?.trim() || 'Progress Indicator';
  const comparison = data.comparison ?? 'vs. the last period';
  const percentLabel = Number.isInteger(data.percent) ? String(data.percent) : data.percent.toFixed(1);
  const up = (data.delta ?? 0) >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="rounded-[1.35rem] border border-white/[0.08] bg-[#0c0c0c] px-5 pb-5 pt-[1.15rem] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-[family-name:var(--font-display)] text-[16px] font-semibold tracking-tight text-white">
          {title}
        </h3>
        <button
          type="button"
          aria-label="More"
          className="rounded-md p-1 text-white/40 transition hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          <MoreHorizontal className="size-4" strokeWidth={2} />
        </button>
      </div>

      <p className="mt-3 max-w-[42ch] text-[14px] leading-snug text-white/55">{data.insight}</p>

      <div className="mt-4 border-t border-white/[0.1] pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="font-[family-name:var(--font-display)] text-[2.15rem] font-semibold leading-none tracking-tight text-white">
            {percentLabel}%
          </span>
          {data.delta != null ? (
            <TrendPill tone="neutral" className="rounded-full border-white/30 px-2.5 py-1 text-[12px] text-white/85">
              <Arrow className="size-3.5" strokeWidth={2.25} aria-hidden />
              {Math.abs(data.delta)}%
            </TrendPill>
          ) : null}
          <span className="text-[13px] text-white/45">{comparison}</span>
        </div>

        <VerticalTicks
          value={data.percent}
          ticks={22}
          color="#f4f4f4"
          emptyColor="#2a2a2a"
          className="mt-5 h-14 gap-[5px]"
          tickClassName="rounded-[3px]"
        />
      </div>
    </article>
  );
}
