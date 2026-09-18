'use client';

import { cn } from '@/lib/utils';
import { COLORS } from '../chart-registry';
import { MetricValue, MicroLabel, SegmentedBar } from './chart-ui';

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
  return (
    <div className="space-y-2">
      <SourceBadge provider={data.provider} />
      {data.findings.map((f) => (
        <div key={f.title} className="rounded-lg border border-white/5 px-2.5 py-2 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--sazabi-crimson)]/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--sazabi-crimson)]">
              {f.severity}
            </span>
            <span className="text-white">{f.title}</span>
          </div>
          <code className="mt-1 block text-[10px] text-white/40">{f.resource}</code>
        </div>
      ))}
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
    <div className="space-y-2 rounded-lg border border-[var(--sazabi-warn)]/30 bg-[var(--sazabi-warn)]/5 p-3">
      <div className="flex items-center gap-2">
        <SourceBadge provider={data.provider} />
        <span className="text-[12px] text-[var(--sazabi-warn)]">{data.providerStatus}</span>
      </div>
      <p className="text-[13px] text-white">Your error rate {data.yourErrorPct}% during window</p>
      <p className="text-[11px] text-white/50">{data.note}</p>
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="aws" />
        <code className="text-[12px] text-white">{data.functionName}</code>
        <span className="text-[10px] text-white/35">{data.period}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Errors', data.errors, 'text-[var(--sazabi-crimson)]'],
          ['Throttles', data.throttles, 'text-[var(--sazabi-warn)]'],
          ['Cold starts', data.coldStarts, 'text-[var(--sazabi-hash)]'],
        ].map(([l, v, c]) => (
          <div key={String(l)} className="rounded-lg bg-white/[0.03] py-2">
            <p className="text-[9px] text-white/40">{l}</p>
            <p className={cn('text-lg font-semibold', c as string)}>{v as number}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AwsAlb5xx({
  data,
}: {
  data: { name: string; count5xx: number; unhealthyTargets: number; targets: string[] };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="aws" />
        <span className="text-[12px] text-white">{data.name}</span>
      </div>
      <div className="flex gap-4">
        <p className="text-[12px]">
          5xx <span className="font-semibold text-[var(--sazabi-crimson)]">{data.count5xx}</span>
        </p>
        <p className="text-[12px]">
          unhealthy <span className="font-semibold text-[var(--sazabi-warn)]">{data.unhealthyTargets}</span>
        </p>
      </div>
      <ul className="font-mono text-[10px] text-white/45">
        {data.targets.map((t) => (
          <li key={t}>{t}</li>
        ))}
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="aws" />
        <code className="text-[12px] text-white">{data.instance}</code>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
        <div className="rounded-lg bg-white/[0.03] py-2">
          <p className="text-[9px] text-white/40">CPU</p>
          <p className="font-semibold text-white">{data.cpu}%</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] py-2">
          <p className="text-[9px] text-white/40">Conns</p>
          <p className="font-semibold text-white">{data.connections}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] py-2">
          <p className="text-[9px] text-white/40">Storage</p>
          <p className={cn('font-semibold', data.storagePct > 85 ? 'text-[var(--sazabi-crimson)]' : 'text-white')}>
            {data.storagePct}%
          </p>
        </div>
      </div>
    </div>
  );
}

export function AwsSqsDlq({
  data,
}: {
  data: { queue: string; depth: number; oldestAge: string };
}) {
  return (
    <div className="space-y-1">
      <SourceBadge provider="aws" />
      <p className="font-mono text-[12px] text-white">{data.queue}</p>
      <p className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--sazabi-crimson)]">{data.depth}</p>
      <p className="text-[11px] text-white/40">oldest message {data.oldestAge}</p>
    </div>
  );
}

export function AwsEcsDesired({
  data,
}: {
  data: { service: string; desired: number; running: number };
}) {
  const ok = data.desired === data.running;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="aws" />
        <span className="text-[12px] text-white">{data.service}</span>
      </div>
      <p className={cn('font-[family-name:var(--font-display)] text-xl font-semibold', ok ? 'text-[var(--sazabi-ok)]' : 'text-[var(--sazabi-warn)]')}>
        {data.running} / {data.desired} running
      </p>
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="azure" />
        <span className="text-[12px] text-white">{data.app}</span>
        <span className="text-[10px] text-white/35">{data.kind}</span>
      </div>
      <p className="text-2xl font-semibold text-[var(--sazabi-crimson)]">{data.failures}</p>
      <code className="block text-[11px] text-white/50">{data.topError}</code>
    </div>
  );
}

export function AzureAksRestarts({
  data,
}: {
  data: { cluster: string; pods: Array<{ name: string; restarts: number }> };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="azure" />
        <span className="text-[12px] text-white">{data.cluster}</span>
      </div>
      {data.pods.map((p) => (
        <div key={p.name} className="flex justify-between rounded border border-white/5 px-2 py-1.5 text-[12px]">
          <code className="text-white/70">{p.name}</code>
          <span className="text-[var(--sazabi-warn)]">{p.restarts} restarts</span>
        </div>
      ))}
    </div>
  );
}

export function AzureServicebusDlq({
  data,
}: {
  data: { topic: string; depth: number };
}) {
  return (
    <div className="space-y-1">
      <SourceBadge provider="azure" />
      <p className="font-mono text-[12px] text-white">{data.topic}</p>
      <p className="text-2xl font-semibold text-[var(--sazabi-crimson)]">{data.depth} in DLQ</p>
    </div>
  );
}

export function AzureEntraAuth({
  data,
}: {
  data: { failures: number; topReason: string; period: string };
}) {
  return (
    <div className="space-y-2">
      <SourceBadge provider="azure" />
      <p className="text-[11px] text-white/40">Entra ID failures · {data.period}</p>
      <p className="text-2xl font-semibold text-[var(--sazabi-warn)]">{data.failures}</p>
      <p className="text-[12px] text-white/60">{data.topReason}</p>
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="gcp" />
        <span className="text-[12px] text-white">{data.service}</span>
      </div>
      {data.revisions.map((r) => (
        <div key={r.name} className="rounded-lg border border-white/5 px-2.5 py-2 text-[12px]">
          <div className="flex justify-between">
            <code className="text-white/80">{r.name}</code>
            <span className="text-white/40">{r.traffic}% traffic</span>
          </div>
          <p className={cn('mt-1 font-semibold', r.errorPct > 2 ? 'text-[var(--sazabi-crimson)]' : 'text-[var(--sazabi-ok)]')}>
            {r.errorPct}% errors
          </p>
        </div>
      ))}
    </div>
  );
}

export function GcpCloudSql({
  data,
}: {
  data: { instance: string; cpu: number; connections: number; diskPct: number };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="gcp" />
        <code className="text-[12px] text-white">{data.instance}</code>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
        <div className="rounded-lg bg-white/[0.03] py-2">
          <p className="text-[9px] text-white/40">CPU</p>
          <p className="font-semibold">{data.cpu}%</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] py-2">
          <p className="text-[9px] text-white/40">Conns</p>
          <p className="font-semibold">{data.connections}</p>
        </div>
        <div className="rounded-lg bg-white/[0.03] py-2">
          <p className="text-[9px] text-white/40">Disk</p>
          <p className="font-semibold">{data.diskPct}%</p>
        </div>
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
    <div className="space-y-1">
      <SourceBadge provider="gcp" />
      <p className="font-mono text-[12px] text-white">{data.subscription}</p>
      <p className="text-2xl font-semibold text-[var(--sazabi-warn)]">{data.unacked} unacked</p>
    </div>
  );
}

export function GcpErrorReporting({
  data,
}: {
  data: { issues: Array<{ title: string; count: number; status: string }> };
}) {
  return (
    <div className="space-y-2">
      <SourceBadge provider="gcp" />
      {data.issues.map((i) => (
        <div key={i.title} className="flex items-center gap-2 rounded border border-white/5 px-2.5 py-2 text-[12px]">
          <span className="min-w-0 flex-1 truncate text-white">{i.title}</span>
          <span className="font-mono text-[var(--sazabi-crimson)]">{i.count}</span>
          <span className="text-[10px] text-white/35">{i.status}</span>
        </div>
      ))}
    </div>
  );
}

export function GcpCloudBuild({
  data,
}: {
  data: { trigger: string; status: string; logTail: string[] };
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SourceBadge provider="gcp" />
        <span className="text-[12px] text-white">{data.trigger}</span>
        <span className="rounded bg-[var(--sazabi-crimson)]/20 px-1.5 py-0.5 text-[10px] uppercase text-[var(--sazabi-crimson)]">
          {data.status}
        </span>
      </div>
      <pre className="overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[10px] text-[#ffb0b8]">{data.logTail.join('\n')}</pre>
    </div>
  );
}
