'use client';

import { cn } from '@/lib/utils';
import { COLORS } from '../chart-registry';
import { MetricTile, MetricValue, MicroLabel, SegmentedBar, SplitPillBar, Subcard, TrendPill, VerticalTicks, FooterMeta } from './chart-ui';

const PROVIDER: Record<string, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

function SourceBadge({ provider }: { provider: string }) {
  return (
    <span className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-[family-name:var(--font-body)] text-[9px] font-semibold uppercase tracking-wider text-white/50">
      {PROVIDER[provider] ?? provider}
    </span>
  );
}

export function ResourceHealth({
  data,
}: {
  data: {
    provider: string;
    resources: Array<{ name: string; region: string; status: 'healthy' | 'degraded' | 'down'; detail?: string }>;
  };
}) {
  const tone = {
    healthy: 'text-[var(--sazabi-ok)]',
    degraded: 'text-[var(--sazabi-warn)]',
    down: 'text-[var(--sazabi-crimson)]',
  };
  return (
    <div className="space-y-2">
      <SourceBadge provider={data.provider} />
      {data.resources.map((r) => (
        <div key={r.name} className="flex items-center gap-2 rounded-lg border border-white/5 px-2.5 py-2 text-[12px]">
          <span className={cn('font-medium capitalize', tone[r.status])}>{r.status}</span>
          <span className="text-white">{r.name}</span>
          <span className="font-mono text-[10px] text-white/35">{r.region}</span>
          {r.detail && <span className="ml-auto text-[10px] text-white/40">{r.detail}</span>}
        </div>
      ))}
    </div>
  );
}

export function QuotaWarning({
  data,
}: {
  data: { provider: string; items: Array<{ name: string; used: number; limit: number; unit: string }> };
}) {
  return (
    <div className="space-y-4">
      <SourceBadge provider={data.provider} />
      {data.items.map((item) => {
        const pct = (item.used / item.limit) * 100;
        const color = pct > 85 ? COLORS.error : pct > 70 ? COLORS.warn : COLORS.ok;
        return (
          <div key={item.name} className="space-y-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="font-[family-name:var(--font-display)] text-[13px] text-white">{item.name}</p>
                <MicroLabel className="mt-0.5">
                  {item.used}/{item.limit} {item.unit}
                </MicroLabel>
              </div>
              <MetricValue size="sm" className={pct > 85 ? 'text-[var(--sazabi-crimson)]' : undefined}>
                {pct.toFixed(0)}%
              </MetricValue>
            </div>
            <SegmentedBar value={pct} color={color} ticks={28} />
            <div className="flex justify-between text-[10px] text-[var(--sazabi-crimson)]/80">
              <span>Unlock at limit</span>
              <span>{pct.toFixed(0)}% maturity</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CostAnomalyLite({
  data,
}: {
  data: { provider: string; service: string; wowPct: number; thisWeek: number; lastWeek: number; currency?: string };
}) {
  const cur = data.currency ?? '$';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <SourceBadge provider={data.provider} />
        <span className="text-[12px] text-white/70">{data.service}</span>
      </div>
      <div>
        <MicroLabel>Week over week</MicroLabel>
        <div className="mt-1">
          <MetricValue size="lg" className="text-[var(--sazabi-crimson)]">
            +{data.wowPct}%
          </MetricValue>
        </div>
      </div>
      <SegmentedBar
        value={Math.min(100, Math.abs(data.wowPct))}
        color="#ff6f42"
        ticks={32}
        showScale
      />
      <p className="text-[11px] text-white/45">
        {cur}
        {data.thisWeek.toLocaleString()} this week vs {cur}
        {data.lastWeek.toLocaleString()} last week
      </p>
    </div>
  );
}

export function IamRisk({
  data,
}: {
  data: {
    provider: string;
    findings: Array<{ severity: string; title: string; resource: string }>;
  };
}) {
  const high = data.findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <SourceBadge provider={data.provider} />
            <MicroLabel className="!mb-0">IAM risk</MicroLabel>
          </div>
          <MetricValue size="2xl" className="text-[var(--sazabi-crimson)]">
            {data.findings.length}
          </MetricValue>
          <p className="mt-2 text-[13px] text-white/40">
            {high} high · {data.findings.length - high} other · read-only scan
          </p>
        </div>
        <TrendPill tone="error">review required</TrendPill>
      </div>
      <div className="space-y-3">
        {data.findings.map((f, i) => (
          <Subcard key={f.title} className="relative overflow-hidden py-4 pl-5">
            <div
              className={cn(
                'absolute inset-y-3 left-0 w-1 rounded-full',
                f.severity === 'high' || f.severity === 'critical'
                  ? 'bg-[var(--sazabi-crimson)]'
                  : 'bg-[var(--sazabi-warn)]',
              )}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-[11px] text-white/30">
                {String(i + 1).padStart(2, '0')}
              </span>
              <TrendPill tone={f.severity === 'high' || f.severity === 'critical' ? 'error' : 'warn'}>
                {f.severity}
              </TrendPill>
            </div>
            <p className="mt-2 font-[family-name:var(--font-display)] text-[15px] font-semibold text-white">{f.title}</p>
            <code className="mt-1.5 block font-mono text-[12px] text-white/40">{f.resource}</code>
          </Subcard>
        ))}
      </div>
    </div>
  );
}

export function OutageOverlay({
  data,
}: {
  data: {
    provider: string;
    providerStatus: string;
    yourErrorPct: number;
    note: string;
  };
}) {
  return (
    <div className="space-y-5 rounded-2xl border border-[var(--sazabi-warn)]/35 bg-[linear-gradient(145deg,rgba(245,197,66,0.08),transparent_55%)] p-1">
      <div className="space-y-5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge provider={data.provider} />
          <TrendPill tone="warn">{data.providerStatus}</TrendPill>
        </div>
        <div>
          <MicroLabel>Your error rate</MicroLabel>
          <div className="mt-2 flex items-center gap-3">
            <MetricValue size="2xl" className="text-[var(--sazabi-warn)]">
              {data.yourErrorPct}%
            </MetricValue>
            <span className="text-[13px] text-white/40">during outage window</span>
          </div>
        </div>
        <VerticalTicks value={Math.min(100, data.yourErrorPct * 12)} ticks={28} color="#f5c542" />
        <p className="text-[13px] leading-relaxed text-white/55">{data.note}</p>
      </div>
    </div>
  );
}

/* AWS */

export function AwsLambdaHealth({
  data,
}: {
  data: { functionName: string; errors: number; throttles: number; coldStarts: number; period: string };
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="aws" />
        <code className="font-mono text-[14px] text-white">{data.functionName}</code>
        <span className="text-[12px] text-white/35">{data.period}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="Errors" value={String(data.errors)} tone="error" />
        <MetricTile label="Throttles" value={String(data.throttles)} tone="warn" />
        <MetricTile label="Cold starts" value={String(data.coldStarts)} tone="info" />
      </div>
    </div>
  );
}

export function AwsAlb5xx({
  data,
}: {
  data: { name: string; count5xx: number; unhealthyTargets: number; targets: string[] };
}) {
  const unhealthy = data.targets.filter((t) => /unhealthy/i.test(t));
  const healthy = data.targets.filter((t) => !/unhealthy/i.test(t));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="aws" />
        <span className="font-[family-name:var(--font-display)] text-[15px] text-white">{data.name}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Subcard className="bg-[rgba(225,29,46,0.08)] py-5 text-center ring-1 ring-[var(--sazabi-crimson)]/25">
          <MicroLabel className="text-[var(--sazabi-crimson)]">5xx responses</MicroLabel>
          <MetricValue size="2xl" className="mt-2 text-[var(--sazabi-crimson)]">
            {data.count5xx}
          </MetricValue>
        </Subcard>
        <Subcard className="py-5 text-center">
          <MicroLabel className="text-[var(--sazabi-warn)]">Unhealthy targets</MicroLabel>
          <MetricValue size="2xl" className="mt-2 text-[var(--sazabi-warn)]">
            {data.unhealthyTargets}
          </MetricValue>
        </Subcard>
      </div>
      <SplitPillBar
        left={{
          label: 'Unhealthy',
          pct: (unhealthy.length / Math.max(data.targets.length, 1)) * 100 || 25,
          color: 'rgba(225,29,46,0.22)',
          textColor: '#ff6b6b',
        }}
        right={{
          label: 'Healthy',
          pct: (healthy.length / Math.max(data.targets.length, 1)) * 100 || 75,
          color: 'rgba(61,214,140,0.15)',
          textColor: 'var(--sazabi-ok)',
        }}
      />
      <ul className="space-y-2">
        {data.targets.map((t) => {
          const bad = /unhealthy/i.test(t);
          return (
            <li
              key={t}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 font-mono text-[12px]',
                bad
                  ? 'border-[var(--sazabi-crimson)]/30 bg-[var(--sazabi-crimson)]/10 text-[#ffb0b8]'
                  : 'border-white/5 bg-white/[0.02] text-white/55',
              )}
            >
              <span className={cn('size-2 rounded-full', bad ? 'bg-[var(--sazabi-crimson)]' : 'bg-[var(--sazabi-ok)]')} />
              {t}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AwsRdsBasics({
  data,
}: {
  data: { instance: string; cpu: number; connections: number; storagePct: number };
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="aws" />
        <code className="font-mono text-[14px] text-white">{data.instance}</code>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ['CPU', data.cpu, data.cpu > 70 ? 'warn' : 'ok', '%'],
            ['Connections', data.connections, 'neutral', ''],
            ['Storage', data.storagePct, data.storagePct > 85 ? 'error' : 'ok', '%'],
          ] as const
        ).map(([label, value, tone, suffix]) => (
          <div key={label} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <MicroLabel>{label}</MicroLabel>
              <span className="font-[family-name:var(--font-display)] text-[22px] font-semibold tabular-nums text-white">
                {value}
                {suffix}
              </span>
            </div>
            <VerticalTicks
              value={typeof value === 'number' && suffix === '%' ? value : Math.min(100, Number(value))}
              ticks={18}
              color={
                tone === 'error' ? '#e11d2e' : tone === 'warn' ? '#f5c542' : tone === 'ok' ? '#3dd68c' : '#8a9bb0'
              }
              className="h-8"
            />
          </div>
        ))}
      </div>
      <FooterMeta
        items={[
          { label: 'Engine', value: 'PostgreSQL' },
          { label: 'Class', value: 'db.r6g.large' },
          { label: 'Storage', value: `${data.storagePct}% used` },
        ]}
      />
    </div>
  );
}

export function AwsSqsDlq({
  data,
}: {
  data: { queue: string; depth: number; oldestAge: string };
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SourceBadge provider="aws" />
        <MicroLabel className="!mb-0">SQS DLQ</MicroLabel>
      </div>
      <div>
        <code className="font-mono text-[13px] text-white/60">{data.queue}</code>
        <div className="mt-2 flex items-center gap-3">
          <MetricValue size="2xl" className="text-[var(--sazabi-crimson)]">
            {data.depth}
          </MetricValue>
          <TrendPill tone="error">in DLQ</TrendPill>
        </div>
      </div>
      <VerticalTicks value={Math.min(100, data.depth * 5)} ticks={28} color="#e11d2e" />
      <FooterMeta
        items={[
          { label: 'Depth', value: String(data.depth) },
          { label: 'Oldest', value: data.oldestAge },
          { label: 'Action', value: 'Inspect & replay' },
        ]}
      />
    </div>
  );
}

export function AwsEcsDesired({
  data,
}: {
  data: { service: string; desired: number; running: number };
}) {
  const ok = data.desired === data.running;
  const pct = (data.running / Math.max(data.desired, 1)) * 100;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="aws" />
        <span className="font-[family-name:var(--font-display)] text-[15px] text-white">{data.service}</span>
        <TrendPill tone={ok ? 'ok' : 'warn'}>{ok ? 'healthy' : 'drift'}</TrendPill>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <MetricValue size="2xl" className={ok ? 'text-[var(--sazabi-ok)]' : 'text-[var(--sazabi-warn)]'}>
          {data.running}
          <span className="text-3xl text-white/30"> / {data.desired}</span>
        </MetricValue>
        <span className="pb-1 text-[13px] text-white/40">tasks running</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: data.desired }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-14 flex-1 rounded-xl transition',
              i < data.running
                ? 'bg-[var(--sazabi-ok)]/80 shadow-[0_0_16px_rgba(61,214,140,0.35)]'
                : 'bg-white/[0.06] ring-1 ring-dashed ring-white/20',
            )}
            title={i < data.running ? 'running' : 'missing'}
          />
        ))}
      </div>
      <SplitPillBar
        left={{
          label: 'Running',
          pct,
          color: 'rgba(61,214,140,0.2)',
          textColor: 'var(--sazabi-ok)',
        }}
        right={{
          label: 'Missing',
          pct: 100 - pct,
          color: 'rgba(245,197,66,0.15)',
          textColor: 'var(--sazabi-warn)',
        }}
      />
    </div>
  );
}

/* Azure */

export function AzureAppFailures({
  data,
}: {
  data: { app: string; failures: number; kind: string; topError: string };
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="azure" />
        <TrendPill>{data.kind}</TrendPill>
      </div>
      <div>
        <p className="font-[family-name:var(--font-display)] text-[16px] text-white">{data.app}</p>
        <div className="mt-2 flex items-center gap-3">
          <MetricValue size="2xl" className="text-[var(--sazabi-crimson)]">
            {data.failures}
          </MetricValue>
          <span className="text-[13px] text-white/40">failures · last hour</span>
        </div>
      </div>
      <VerticalTicks value={Math.min(100, data.failures * 4)} ticks={30} color="#e11d2e" />
      <Subcard className="border-[var(--sazabi-crimson)]/20 bg-[rgba(225,29,46,0.08)] py-4">
        <MicroLabel className="text-[var(--sazabi-crimson)]">Top error</MicroLabel>
        <code className="mt-2 block font-mono text-[14px] leading-relaxed text-[#ffb0b8]">{data.topError}</code>
      </Subcard>
    </div>
  );
}

export function AzureAksRestarts({
  data,
}: {
  data: { cluster: string; pods: Array<{ name: string; restarts: number }> };
}) {
  const max = Math.max(...data.pods.map((p) => p.restarts), 1);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SourceBadge provider="azure" />
        <span className="font-[family-name:var(--font-display)] text-[15px] text-white">{data.cluster}</span>
      </div>
      <div className="space-y-4">
        {data.pods.map((p) => (
          <div key={p.name}>
            <div className="mb-2 flex justify-between gap-3">
              <code className="font-mono text-[13px] text-white/80">{p.name}</code>
              <span className="font-[family-name:var(--font-display)] text-[14px] text-[var(--sazabi-warn)]">
                {p.restarts} restarts
              </span>
            </div>
            <VerticalTicks value={p.restarts} max={max} ticks={22} color="#f5c542" className="h-7" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AzureServicebusDlq({
  data,
}: {
  data: { topic: string; depth: number };
}) {
  return (
    <div className="space-y-5">
      <SourceBadge provider="azure" />
      <code className="block font-mono text-[13px] text-white/60">{data.topic}</code>
      <div className="flex items-center gap-3">
        <MetricValue size="2xl" className="text-[var(--sazabi-crimson)]">
          {data.depth}
        </MetricValue>
        <TrendPill tone="error">in DLQ</TrendPill>
      </div>
      <VerticalTicks value={Math.min(100, data.depth * 8)} ticks={26} color="#e11d2e" />
    </div>
  );
}

export function AzureEntraAuth({
  data,
}: {
  data: { failures: number; topReason: string; period: string };
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SourceBadge provider="azure" />
        <MicroLabel className="!mb-0">Entra ID · {data.period}</MicroLabel>
      </div>
      <div className="flex items-center gap-3">
        <MetricValue size="2xl" className="text-[var(--sazabi-warn)]">
          {data.failures}
        </MetricValue>
        <TrendPill tone="warn">auth failures</TrendPill>
      </div>
      <Subcard className="py-4">
        <MicroLabel>Top reason</MicroLabel>
        <p className="mt-2 font-mono text-[13px] text-white/75">{data.topReason}</p>
      </Subcard>
    </div>
  );
}

/* GCP */

export function GcpCloudRun({
  data,
}: {
  data: { service: string; revisions: Array<{ name: string; errorPct: number; traffic: number }> };
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SourceBadge provider="gcp" />
        <span className="font-[family-name:var(--font-display)] text-[15px] text-white">{data.service}</span>
      </div>
      <div className="space-y-3">
        {data.revisions.map((r) => (
          <Subcard key={r.name} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono text-[13px] text-white/85">{r.name}</code>
              <span className="text-[12px] text-white/40">{r.traffic}% traffic</span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={cn(
                  'font-[family-name:var(--font-display)] text-2xl font-semibold',
                  r.errorPct > 2 ? 'text-[var(--sazabi-crimson)]' : 'text-[var(--sazabi-ok)]',
                )}
              >
                {r.errorPct}%
              </span>
              <span className="text-[12px] text-white/35">errors</span>
            </div>
            <div className="mt-3">
              <SegmentedBar
                value={r.errorPct}
                max={10}
                color={r.errorPct > 2 ? '#e11d2e' : '#3dd68c'}
                ticks={24}
              />
            </div>
          </Subcard>
        ))}
      </div>
    </div>
  );
}

export function GcpCloudSql({
  data,
}: {
  data: { instance: string; cpu: number; connections: number; diskPct: number };
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SourceBadge provider="gcp" />
        <code className="font-mono text-[14px] text-white">{data.instance}</code>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="CPU" value={`${data.cpu}%`} tone={data.cpu > 70 ? 'warn' : 'ok'} />
        <MetricTile label="Conns" value={String(data.connections)} />
        <MetricTile label="Disk" value={`${data.diskPct}%`} tone={data.diskPct > 85 ? 'error' : 'ok'} />
      </div>
    </div>
  );
}

export function GcpPubsubUnacked({
  data,
}: {
  data: { subscription: string; unacked: number };
}) {
  return (
    <div className="space-y-5">
      <SourceBadge provider="gcp" />
      <code className="block font-mono text-[13px] text-white/60">{data.subscription}</code>
      <div className="flex items-center gap-3">
        <MetricValue size="2xl" className="text-[var(--sazabi-warn)]">
          {data.unacked.toLocaleString()}
        </MetricValue>
        <TrendPill tone="warn">unacked</TrendPill>
      </div>
      <VerticalTicks value={Math.min(100, data.unacked / 20)} ticks={28} color="#f5c542" />
    </div>
  );
}

export function GcpErrorReporting({
  data,
}: {
  data: { issues: Array<{ title: string; count: number; status: string }> };
}) {
  return (
    <div className="space-y-5">
      <SourceBadge provider="gcp" />
      <div>
        {data.issues.map((i) => (
          <div key={i.title} className="flex items-start gap-4 border-b border-white/[0.06] py-4 last:border-0">
            <MetricValue size="md" className="min-w-[3.5rem] text-[var(--sazabi-crimson)]">
              {i.count}
            </MetricValue>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-white">{i.title}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-white/35">{i.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GcpCloudBuild({
  data,
}: {
  data: { trigger: string; status: string; logTail: string[] };
}) {
  const failed = /fail/i.test(data.status);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge provider="gcp" />
        <span className="font-[family-name:var(--font-display)] text-[15px] text-white">{data.trigger}</span>
        <TrendPill tone={failed ? 'error' : 'ok'}>{data.status}</TrendPill>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-[var(--sazabi-crimson)]/30 bg-[#1a0c10]">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[var(--sazabi-crimson)]" />
          <span className="size-2.5 rounded-full bg-[var(--sazabi-warn)]/60" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-2 font-mono text-[11px] text-white/35">cloud-build · logs</span>
        </div>
        <pre className="overflow-auto p-4 font-mono text-[12px] leading-relaxed text-[#ffb0b8]">
          {data.logTail.map((line, i) => (
            <div key={i} className="flex gap-3">
              <span className="w-5 shrink-0 select-none text-white/20">{i + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
