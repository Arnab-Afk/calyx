'use client';

import { ArrowLeft, Check, ChevronRight, Copy, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest, Loader2, Plus, RefreshCw, Rocket, Tag, Trash2, Unplug } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useOpsEvents,
  useOpsGithubActivity,
  useOpsProjectDetail,
  useOpsProjects,
  type OpsEvent,
  type OpsGithubActivityItem,
  type OpsSource,
} from '@/features/control/api/use-ops';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { chatApi } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

const INTAKE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CALYX_INTAKE_URL?.replace(/\/$/, '')) ||
  'https://calyx-intake.arnabbhowmik.in';

type Tab = 'overview' | 'logs' | 'git' | 'sources' | 'settings';

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0 border-white/15"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        toast.success(`${label} copied`);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function levelColor(level: string) {
  switch (level) {
    case 'error':
    case 'fatal':
      return 'text-rose-300';
    case 'warn':
      return 'text-amber-300';
    case 'debug':
      return 'text-white/35';
    default:
      return 'text-sky-300/90';
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ProjectsListPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { projects, loading, error, create, reload } = useOpsProjects();
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0c] text-white">
      <div className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-6 py-8">
          <div>
            <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.2em] text-white/40">
              Dashboard
            </p>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl text-white">Projects</h1>
            <p className="mt-1 text-sm text-white/50">Apps shipping logs into this workspace.</p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const next = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
              if (next.length < 2) return;
              setBusy(true);
              try {
                await create(next);
                toast.success('Project created');
                setSlug('');
                await reload();
                router.push(`/workspace/${workspaceId}/projects/${encodeURIComponent(next)}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Create failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              placeholder="new-project"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-44 border-white/15 bg-black/40 text-white"
            />
            <Button type="submit" disabled={busy || slug.trim().length < 2} className="bg-[var(--sazabi-crimson)] hover:bg-[var(--sazabi-crimson)]/90">
              <Plus className="mr-1 size-4" />
              Add
            </Button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
            {error}
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="size-4 animate-spin" />
            Loading projects…
          </div>
        )}
        {!loading && projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
            <p className="font-[family-name:var(--font-display)] text-lg text-white">No projects yet</p>
            <p className="mt-1 text-sm text-white/45">Create one above to connect logs and GitHub.</p>
          </div>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/workspace/${workspaceId}/projects/${encodeURIComponent(p.slug)}`}
                className="group block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-[family-name:var(--font-display)] text-lg text-white">{p.name || p.slug}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-white/40">{p.slug}</p>
                  </div>
                  <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/45">
                    {p.environment ?? 'prod'}
                  </span>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-xs text-white/40 group-hover:text-white/55">
                  Logs, sources, GitHub
                  <ChevronRight className="size-3.5 opacity-70 transition group-hover:translate-x-0.5" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function gitKindMeta(kind: OpsGithubActivityItem['kind']) {
  switch (kind) {
    case 'merge':
      return { label: 'Merge', icon: GitMerge, className: 'text-violet-300' };
    case 'pull_request':
      return { label: 'Pull request', icon: GitPullRequest, className: 'text-sky-300' };
    case 'deploy':
      return { label: 'Deploy', icon: Rocket, className: 'text-emerald-300' };
    case 'release':
      return { label: 'Release', icon: Tag, className: 'text-amber-300' };
    case 'branch':
      return { label: 'Branch', icon: GitBranch, className: 'text-white/55' };
    case 'push':
      return { label: 'Push', icon: GitCommitHorizontal, className: 'text-white/70' };
    default:
      return { label: 'GitHub', icon: GitBranch, className: 'text-white/50' };
  }
}

function GitActivityPanel({ slug, connected }: { slug: string; connected: boolean }) {
  const [kind, setKind] = useState<string>('all');
  const { activity, repo, counts, loading, error, reload } = useOpsGithubActivity(slug, {
    limit: 100,
    pollMs: 15000,
    enabled: true,
  });

  const filtered = useMemo(() => {
    if (kind === 'all') return activity;
    return activity.filter((item) => item.kind === kind);
  }, [activity, kind]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Pushes', value: counts.push },
          { label: 'Merges', value: counts.merge },
          { label: 'Pull requests', value: counts.pull_request },
          { label: 'Deploys', value: counts.deploy },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-white/40">{card.label}</p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            <SelectItem value="push">Pushes</SelectItem>
            <SelectItem value="merge">Merges</SelectItem>
            <SelectItem value="pull_request">Pull requests</SelectItem>
            <SelectItem value="deploy">Deploys</SelectItem>
            <SelectItem value="release">Releases</SelectItem>
            <SelectItem value="branch">Branches</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="border-white/15" onClick={() => void reload(false)}>
          <RefreshCw className="mr-1 size-3.5" />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-white/15"
          disabled={loading || !connected}
          onClick={async () => {
            try {
              await reload(true);
              toast.success('Synced recent commits from GitHub');
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'Sync failed');
            }
          }}
        >
          Sync from GitHub
        </Button>
        {loading && <Loader2 className="size-4 animate-spin text-white/40" />}
        {repo && <span className="text-xs text-white/40">{repo}</span>}
      </div>

      {error && <p className="text-sm text-amber-200/90">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <div className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/35">
          Git activity · {filtered.length} events
        </div>
        <ul className="max-h-[min(560px,55vh)] divide-y divide-white/5 overflow-y-auto">
          {!connected && filtered.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-white/40">
              Connect a repository in Settings to receive pushes, merges, and deploys.
            </li>
          )}
          {connected && filtered.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-white/40">
              No activity yet — click Sync from GitHub, or push/merge to start receiving webhooks.
            </li>
          )}
          {filtered.map((item) => {
            const meta = gitKindMeta(item.kind);
            const Icon = meta.icon;
            const body = (
              <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03]">
                <span className={cn('mt-0.5 rounded-md border border-white/10 bg-white/[0.04] p-1.5', meta.className)}>
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-white/35">{meta.label}</span>
                    {item.sha && (
                      <span className="font-mono text-[10px] text-white/35">{String(item.sha).slice(0, 7)}</span>
                    )}
                    {item.status && <span className="text-[10px] text-white/40">{item.status}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-white/90">{item.title}</p>
                  <p className="mt-1 text-[11px] text-white/40">
                    {[item.actor, item.summary || (item.ref ? String(item.ref).replace(/^refs\/heads\//, '') : null), formatTime(item.at)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            );
            return (
              <li key={item.id}>
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="block">
                    {body}
                  </a>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function LogsPanel({ sources }: { sources: OpsSource[] }) {
  const services = useMemo(() => [...new Set(sources.map((s) => s.service).filter(Boolean))], [sources]);
  const [service, setService] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');
  const activeService = service === 'all' ? null : service;
  const activeLevel = level === 'all' ? null : level;

  const { events, loading, error, reload } = useOpsEvents({
    service: activeService,
    level: activeLevel,
    limit: 100,
    enabled: true,
    pollMs: 8000,
  });

  const filtered = useMemo(() => {
    if (service === 'all' && services.length > 0) {
      return events.filter((e) => services.includes(e.service));
    }
    return events;
  }, [events, service, services]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {services.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {['debug', 'info', 'warn', 'error', 'fatal'].map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="border-white/15" onClick={() => void reload()}>
          <RefreshCw className="mr-1 size-3.5" />
          Refresh
        </Button>
        {loading && <Loader2 className="size-4 animate-spin text-white/40" />}
      </div>

      {error && <p className="text-sm text-amber-200/90">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
        <div className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/35">
          Live log stream · {filtered.length} events
        </div>
        <ul className="max-h-[min(560px,55vh)] divide-y divide-white/5 overflow-y-auto font-mono text-[11px]">
          {filtered.length === 0 && (
            <li className="px-3 py-8 text-center text-white/40">
              {sources.length === 0
                ? 'Add a source first, then ship logs.'
                : 'No events yet — waiting for intake.'}
            </li>
          )}
          {filtered.map((ev: OpsEvent) => (
            <li key={ev.id} className="grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-0.5 px-3 py-2 hover:bg-white/[0.03]">
              <span className="whitespace-nowrap text-white/30">{formatTime(ev.timestamp)}</span>
              <span className={cn('uppercase', levelColor(ev.level))}>{ev.level}</span>
              <span className="min-w-0">
                <span className="text-white/45">[{ev.service}]</span>{' '}
                <span className="break-all text-white/80">{ev.message}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SourcesPanel({
  projectSlug,
  sources,
  createSource,
  rotateToken,
  deleteSource,
  reload,
}: {
  projectSlug: string;
  sources: OpsSource[];
  createSource: ReturnType<typeof useOpsProjectDetail>['createSource'];
  rotateToken: ReturnType<typeof useOpsProjectDetail>['rotateToken'];
  deleteSource: ReturnType<typeof useOpsProjectDetail>['deleteSource'];
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceRole, setSourceRole] = useState<'frontend' | 'backend' | 'other'>('backend');
  const [provider, setProvider] = useState<'http' | 'cloudwatch' | 'vercel'>('http');
  const [lastCreated, setLastCreated] = useState<{
    token?: string;
    sourceName: string;
    intakeUrl?: string;
    drainUrl?: string;
    drainSecret?: string | null;
    provider: string;
  } | null>(null);

  const defaultService =
    provider === 'cloudwatch' ? 'aws' : provider === 'vercel' ? 'vercel' : sourceRole === 'frontend' ? 'web' : 'api';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-medium text-white">Connect a log source</p>
        <p className="mt-1 text-xs text-white/45">
          HTTP for apps/SDKs. CloudWatch for AWS log groups (no VM agent). Vercel for platform drains.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Name</label>
            <Input
              placeholder={
                provider === 'cloudwatch'
                  ? `${projectSlug}-cloudwatch`
                  : provider === 'vercel'
                    ? `${projectSlug}-vercel`
                    : `${projectSlug}-api`
              }
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="border-white/15 bg-black/40 text-white"
            />
          </div>
          <div className="w-[150px]">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Type</label>
            <Select
              value={provider}
              onValueChange={(v) => {
                const next = v as 'http' | 'cloudwatch' | 'vercel';
                setProvider(next);
                if (next === 'cloudwatch' || next === 'vercel') setSourceRole(next === 'vercel' ? 'frontend' : 'backend');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP / SDK</SelectItem>
                <SelectItem value="cloudwatch">CloudWatch</SelectItem>
                <SelectItem value="vercel">Vercel drain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {provider === 'http' && (
            <div className="w-[140px]">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Role</label>
              <Select value={sourceRole} onValueChange={(v) => setSourceRole(v as 'frontend' | 'backend' | 'other')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frontend">frontend</SelectItem>
                  <SelectItem value="backend">backend</SelectItem>
                  <SelectItem value="other">other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const name =
                  sourceName.trim() ||
                  `${projectSlug}-${provider === 'http' ? sourceRole : provider}`;
                const res = await createSource({
                  role: provider === 'vercel' ? 'frontend' : provider === 'cloudwatch' ? 'backend' : sourceRole,
                  service: defaultService,
                  name,
                  provider,
                });
                setLastCreated({
                  token: res.token,
                  sourceName: name,
                  intakeUrl: res.intakeUrl ?? `${INTAKE}/v1/logs`,
                  drainUrl: res.drainUrl ?? (provider === 'cloudwatch' && res.source?.id
                    ? `${INTAKE}/v1/drains/cloudwatch/${res.source.id}`
                    : undefined),
                  drainSecret: res.drainSecret,
                  provider,
                });
                toast.success(
                  provider === 'cloudwatch'
                    ? 'CloudWatch source created — copy drain URL + token'
                    : provider === 'vercel'
                      ? 'Vercel drain created — copy URL + secret'
                      : 'Source created',
                );
                setSourceName('');
                await reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            {provider === 'cloudwatch' ? 'Connect CloudWatch' : provider === 'vercel' ? 'Create Vercel drain' : 'Generate key'}
          </Button>
        </div>
      </div>

      {lastCreated && lastCreated.provider === 'cloudwatch' && lastCreated.token && lastCreated.drainUrl && (
        <div className="space-y-3 rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
          <p className="text-sm font-medium text-sky-100">CloudWatch connected — finish setup in AWS</p>
          <p className="text-xs leading-relaxed text-white/55">
            No VM agent needed. In AWS, create a small Lambda that POSTs CloudWatch subscription events to Calyx, then
            add a subscription filter on your log group pointing at that Lambda.
          </p>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/40">Drain URL</p>
            <div className="mt-1 flex items-start gap-2">
              <code className="flex-1 break-all font-mono text-[11px] text-sky-200/90">{lastCreated.drainUrl}</code>
              <CopyButton value={lastCreated.drainUrl} label="Drain URL" />
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/40">Source token (shown once)</p>
            <div className="mt-1 flex items-start gap-2">
              <code className="flex-1 break-all font-mono text-[11px] text-sky-200/90">{lastCreated.token}</code>
              <CopyButton value={lastCreated.token} label="Token" />
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/40">Lambda handler</p>
            <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{`export const handler = async (event) => {
  const res = await fetch(process.env.CALYX_CLOUDWATCH_URL, {
    method: "POST",
    headers: {
      authorization: \`Bearer \${process.env.CALYX_SOURCE_TOKEN}\`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(await res.text());
};`}</pre>
          </div>
          <pre className="overflow-x-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{`CALYX_CLOUDWATCH_URL=${lastCreated.drainUrl}
CALYX_SOURCE_TOKEN=${lastCreated.token}`}</pre>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-white/55">
            <li>Create a Node.js Lambda with the handler above.</li>
            <li>Set the two env vars (store the token in Secrets Manager if you prefer).</li>
            <li>On your CloudWatch log group → Subscription filters → Lambda destination.</li>
            <li>Send a test log — this source should flip to “receiving”.</li>
          </ol>
        </div>
      )}

      {lastCreated && lastCreated.provider === 'vercel' && lastCreated.drainUrl && (
        <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
          <p className="text-sm font-medium text-violet-100">Vercel drain — paste into Vercel</p>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-white/40">Drain URL</p>
            <div className="mt-1 flex items-start gap-2">
              <code className="flex-1 break-all font-mono text-[11px] text-violet-200/90">{lastCreated.drainUrl}</code>
              <CopyButton value={lastCreated.drainUrl} label="Drain URL" />
            </div>
          </div>
          {lastCreated.drainSecret && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-white/40">Signature secret (once)</p>
              <div className="mt-1 flex items-start gap-2">
                <code className="flex-1 break-all font-mono text-[11px] text-violet-200/90">{lastCreated.drainSecret}</code>
                <CopyButton value={lastCreated.drainSecret} label="Secret" />
              </div>
            </div>
          )}
          <p className="text-xs text-white/50">Vercel → Team Settings → Drains → Custom Endpoint → Format JSON.</p>
        </div>
      )}

      {lastCreated && lastCreated.provider === 'http' && lastCreated.token && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-emerald-200/90">API key for {lastCreated.sourceName} (once)</p>
              <p className="mt-2 break-all font-mono text-[11px] text-emerald-300/90">{lastCreated.token}</p>
            </div>
            <CopyButton value={lastCreated.token} label="API key" />
          </div>
          <pre className="mt-3 overflow-x-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{`CALYX_INTAKE_URL=${lastCreated.intakeUrl}
CALYX_SOURCE_TOKEN=${lastCreated.token}`}</pre>
        </div>
      )}

      <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
        {sources.length === 0 && <li className="px-4 py-6 text-sm text-white/45">No sources yet.</li>}
        {sources.map((s) => {
          const drainGuess =
            s.drainUrl ||
            (s.provider === 'cloudwatch' ? `${INTAKE}/v1/drains/cloudwatch/${s.id}` : undefined) ||
            (s.provider === 'vercel' ? `${INTAKE}/v1/drains/vercel/${s.id}` : undefined);
          return (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-white/90">{s.name}</p>
                <p className="text-[11px] text-white/40">
                  {s.role}/{s.service} · {s.provider}
                  {s.lastEventAt ? (
                    <span className="ml-2 text-emerald-400/80">receiving</span>
                  ) : (
                    <span className="ml-2 text-amber-300/70">waiting</span>
                  )}
                </p>
                {drainGuess && (
                  <p className="mt-1 truncate font-mono text-[10px] text-white/35" title={drainGuess}>
                    {drainGuess}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {drainGuess && <CopyButton value={drainGuess} label="Drain URL" />}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/15"
                  disabled={busy || s.provider === 'vercel'}
                  onClick={async () => {
                    if (!confirm(`Rotate API key for “${s.name}”?`)) return;
                    setBusy(true);
                    try {
                      const res = await rotateToken(s.id);
                      if (res.token) {
                        setLastCreated({
                          token: res.token,
                          sourceName: s.name,
                          intakeUrl: res.intakeUrl ?? `${INTAKE}/v1/logs`,
                          drainUrl:
                            res.drainUrl ||
                            (s.provider === 'cloudwatch' ? `${INTAKE}/v1/drains/cloudwatch/${s.id}` : undefined),
                          provider: s.provider,
                        });
                      }
                      toast.success('Key rotated');
                      await reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Rotate failed');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <RefreshCw className="mr-1 size-3.5" />
                  Rotate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-500/30 text-red-200/90 hover:bg-red-500/10"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !confirm(
                        `Delete source “${s.name}”? Its API key stops working immediately. Past logs stay in Calyx.`,
                      )
                    ) {
                      return;
                    }
                    setBusy(true);
                    try {
                      await deleteSource(s.id);
                      toast.success('Source deleted');
                      await reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Delete failed');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 className="mr-1 size-3.5" />
                  Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ProjectDetailPage({ slug }: { slug: string }) {
  const workspaceId = useWorkspaceId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('overview');
  const {
    detail,
    sources,
    github,
    loading,
    error,
    createSource,
    rotateToken,
    deleteSource,
    deleteProject,
    connectGithub,
    completeGithub,
    disconnectGithub,
    reload,
  } = useOpsProjectDetail(slug);

  const [busy, setBusy] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [installInput, setInstallInput] = useState('');
  const [repoChoices, setRepoChoices] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState('');

  useEffect(() => {
    const gh = searchParams.get('github');
    if (!gh) return;
    if (gh === 'connected') {
      toast.success(searchParams.get('repo') ? `Connected ${searchParams.get('repo')}` : 'GitHub connected');
      void reload();
      setTab('settings');
    } else if (gh === 'error') {
      toast.error(searchParams.get('message') || 'GitHub connection failed');
      setTab('settings');
    }
    router.replace(`/workspace/${workspaceId}/projects/${encodeURIComponent(slug)}`, { scroll: false });
  }, [searchParams, router, workspaceId, slug, reload]);

  const project = detail?.project;
  const receiving = sources.filter((s) => s.lastEventAt).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'git', label: 'Git' },
    { id: 'sources', label: 'Sources' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0c] text-white">
      <div className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <Link
            href={`/workspace/${workspaceId}/projects`}
            className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70"
          >
            <ArrowLeft className="size-3.5" />
            Projects
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-3xl text-white">
                {loading ? '…' : project?.name || slug}
              </h1>
              <p className="mt-1 font-mono text-xs text-white/40">{slug}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-white/45">
                {project?.environment ?? 'production'}
              </span>
              {github ? (
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300/90">
                  {github.repo}
                </span>
              ) : (
                <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-white/40">GitHub not connected</span>
              )}
            </div>
          </div>

          <nav className="mt-6 flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'border-b-2 px-3 py-2 text-sm transition',
                  tab === t.id
                    ? 'border-[var(--sazabi-crimson)] text-white'
                    : 'border-transparent text-white/45 hover:text-white/80',
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
            {error}
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Loader2 className="size-4 animate-spin" />
            Loading project…
          </div>
        )}

        {!loading && tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Sources', value: String(sources.length) },
                { label: 'Receiving', value: String(receiving) },
                { label: 'GitHub', value: github ? 'Connected' : '—' },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[11px] uppercase tracking-wide text-white/40">{card.label}</p>
                  <p className="mt-2 font-[family-name:var(--font-display)] text-2xl text-white">{card.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm font-medium">Quick actions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="border-white/15" onClick={() => setTab('git')}>
                  View git activity
                </Button>
                <Button size="sm" variant="outline" className="border-white/15" onClick={() => setTab('logs')}>
                  View logs
                </Button>
                <Button size="sm" variant="outline" className="border-white/15" onClick={() => setTab('sources')}>
                  Manage sources
                </Button>
                <Button size="sm" variant="outline" className="border-white/15" onClick={() => setTab('settings')}>
                  Connect GitHub
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="mb-3 text-sm font-medium">Sources</p>
              <ul className="space-y-2 text-sm text-white/60">
                {sources.length === 0 && <li className="text-white/40">None yet — add under Sources.</li>}
                {sources.map((s) => (
                  <li key={s.id} className="flex justify-between gap-2">
                    <span>{s.name}</span>
                    <span className="text-[11px] text-white/35">
                      {s.lastEventAt ? `last ${formatTime(s.lastEventAt)}` : 'waiting'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {!loading && tab === 'logs' && <LogsPanel sources={sources} />}

        {!loading && tab === 'git' && <GitActivityPanel slug={slug} connected={Boolean(github)} />}

        {!loading && tab === 'sources' && (
          <SourcesPanel
            projectSlug={slug}
            sources={sources}
            createSource={createSource}
            rotateToken={rotateToken}
            deleteSource={deleteSource}
            reload={reload}
          />
        )}

        {!loading && tab === 'settings' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <GitBranch className="mt-0.5 size-4 text-white/45" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">GitHub repository</p>
                  <p className="mt-1 text-xs text-white/45">
                    Install the Calyx GitHub App. If GitHub leaves you on the installations page, paste that URL below to finish linking.
                  </p>
                  {github ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2">
                      <span className="text-sm">{github.repo}</span>
                      <span className="text-[11px] text-emerald-400/80">connected</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto border-white/15"
                        disabled={busy}
                        onClick={async () => {
                          if (!confirm(`Disconnect ${github.repo}?`)) return;
                          setBusy(true);
                          try {
                            await disconnectGithub();
                            toast.success('Disconnected');
                            await reload();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Failed');
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Unplug className="mr-1 size-3.5" />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const returnTo =
                              typeof window !== 'undefined'
                                ? `${window.location.origin}/workspace/${workspaceId}/projects/${encodeURIComponent(slug)}`
                                : undefined;
                            const res = await connectGithub({ returnTo });
                            toast.message('Install the Calyx GitHub App…');
                            window.location.assign(res.installationUrl);
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Failed');
                            setBusy(false);
                          }
                        }}
                      >
                        <GitBranch className="mr-1.5 size-4" />
                        Connect repository
                      </Button>

                      <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-white/40">Already installed?</p>
                        <p className="mt-1 text-xs text-white/45">
                          Paste the installations URL (e.g. github.com/settings/installations/…) then finish linking.
                        </p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={installInput}
                            onChange={(e) => setInstallInput(e.target.value)}
                            placeholder="https://github.com/settings/installations/123456"
                            className="border-white/15 bg-black/40 text-white"
                          />
                          <Button
                            variant="outline"
                            className="shrink-0 border-white/15"
                            disabled={busy || !installInput.trim()}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                const res = await completeGithub({
                                  installationId: installInput.trim(),
                                  repo: selectedRepo || undefined,
                                });
                                toast.success(`Connected ${res.repo}`);
                                setRepoChoices([]);
                                setSelectedRepo('');
                                await reload();
                              } catch (e) {
                                const err = e as Error & { data?: { repos?: string[]; installationId?: string } };
                                if (err.data?.repos && err.data.repos.length > 0) {
                                  setRepoChoices(err.data.repos);
                                  toast.message('Pick a repository to finish connecting');
                                } else {
                                  toast.error(err.message || 'Failed');
                                }
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Finish linking
                          </Button>
                        </div>
                        {repoChoices.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Select value={selectedRepo || undefined} onValueChange={setSelectedRepo}>
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select repository…" />
                              </SelectTrigger>
                              <SelectContent>
                                {repoChoices.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              disabled={busy || !selectedRepo}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  const res = await completeGithub({
                                    installationId: installInput.trim(),
                                    repo: selectedRepo,
                                  });
                                  toast.success(`Connected ${res.repo}`);
                                  setRepoChoices([]);
                                  setSelectedRepo('');
                                  await reload();
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : 'Failed');
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              Connect selected
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {project?.id && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm font-medium">Share this project</p>
                <p className="mt-1 text-xs text-white/45">
                  Invitee gets a workspace named after this project — only this project’s logs &amp; GitHub.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    type="email"
                    placeholder="teammate@company.com"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    className="border-white/15 bg-black/40 text-white"
                  />
                  <Button
                    disabled={busy || !shareEmail.includes('@')}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const res = await chatApi.shareProject(String(workspaceId), {
                          email: shareEmail.trim(),
                          projectId: project.id,
                          projectSlug: project.slug || slug,
                          projectName: project.name || slug,
                        });
                        toast.success(
                          res.invite.status === 'added'
                            ? `Shared — they see “${res.workspace.name}”`
                            : `Invite saved for ${shareEmail.trim()}`,
                        );
                        setShareEmail('');
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Share failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Share
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.04] p-4">
              <p className="text-sm font-medium text-red-100/90">Delete project</p>
              <p className="mt-1 text-xs text-white/45">
                Removes this project, its sources, and GitHub/Slack bindings. Past log events stay in Calyx.
              </p>
              <Button
                className="mt-3 border-red-500/40 bg-red-500/15 text-red-100 hover:bg-red-500/25"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  const label = project?.slug || slug;
                  if (
                    !confirm(
                      `Delete project “${label}”? This cannot be undone. Type-confirm by continuing only if you mean it.`,
                    )
                  ) {
                    return;
                  }
                  const typed = window.prompt(`Type “${label}” to confirm deletion:`);
                  if (typed !== label) {
                    toast.message('Delete cancelled');
                    return;
                  }
                  setBusy(true);
                  try {
                    await deleteProject();
                    toast.success(`Deleted ${label}`);
                    router.push(`/workspace/${workspaceId}/projects`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Delete failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 className="mr-1 size-3.5" />
                Delete project
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
