'use client';

import { Check, ChevronRight, Copy, GitBranch, KeyRound, Loader2, Plus, RefreshCw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOpsProjectDetail, useOpsProjects } from '@/features/control/api/use-ops';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { chatApi } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

const INTAKE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CALYX_INTAKE_URL?.replace(/\/$/, '')) ||
  'https://calyx-intake.arnabbhowmik.in';

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-white/10 bg-white/[0.03] p-4', className)}>{children}</div>;
}

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

export function ProjectsPanel({ initialSlug = null }: { initialSlug?: string | null }) {
  const { projects, loading, error, create, reload } = useOpsProjects();
  const [slug, setSlug] = useState('');
  const [selected, setSelected] = useState<string | null>(initialSlug);

  useEffect(() => {
    if (initialSlug) setSelected(initialSlug);
  }, [initialSlug]);

  const {
    detail,
    sources,
    github,
    loading: detailLoading,
    createSource,
    rotateToken,
    connectGithub,
    disconnectGithub,
    reload: reloadDetail,
  } = useOpsProjectDetail(selected);

  const [busy, setBusy] = useState(false);
  const [lastToken, setLastToken] = useState<{ token: string; sourceName: string; intakeUrl?: string } | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceRole, setSourceRole] = useState<'frontend' | 'backend'>('frontend');
  const [shareEmail, setShareEmail] = useState('');
  const workspaceId = useWorkspaceId();

  const showToken = (token: string, name: string, intakeUrl?: string) => {
    setLastToken({ token, sourceName: name, intakeUrl: intakeUrl ?? `${INTAKE}/v1/logs` });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-6 py-8">
      <div>
        <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.2em] text-white/40">Dashboard</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">Projects &amp; logs</h2>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-white/50">
          <span>Workspace</span>
          <ChevronRight className="size-3.5 text-white/30" />
          <span>projects</span>
          <ChevronRight className="size-3.5 text-white/30" />
          <span>sources &amp; GitHub</span>
          <span className="w-full sm:w-auto">Generate API keys and connect the repo Calyx uses for remediations.</span>
        </p>
      </div>

      {error && (
        <Card className="border-amber-500/30 text-sm text-amber-100/90">
          {error}
          <p className="mt-2 text-xs text-white/45">
            Set <code className="text-white/70">CALYX_API_URL</code> and <code className="text-white/70">CALYX_MGMT_TOKEN</code> on the web
            server to enable this panel.
          </p>
        </Card>
      )}

      <Card>
        <p className="text-sm font-medium">Create project</p>
        <p className="mt-1 text-xs text-white/45">One project per app / environment. Slug becomes the intake namespace.</p>
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="my-app"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="border-white/15 bg-black/40 text-white"
          />
          <Button
            disabled={busy || slug.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                const next = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
                await create(next);
                toast.success('Project created');
                setSlug('');
                setSelected(next);
                setLastToken(null);
                await reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Create failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="mr-1 size-4" />
            Create
          </Button>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium">Your projects</p>
        {loading && <Loader2 className="size-4 animate-spin text-white/40" />}
        {!loading && projects.length === 0 && <p className="text-xs text-white/45">No projects yet — create one above or finish onboarding.</p>}
        <ul className="space-y-1">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(p.slug);
                  setLastToken(null);
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm',
                  selected === p.slug ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5',
                )}
              >
                <span>{p.slug}</span>
                <span className="text-[11px] uppercase text-white/35">{p.environment ?? 'prod'}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {selected && (
        <>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Log sources — {selected}</p>
                <p className="mt-0.5 text-xs text-white/45">Each source gets an API key (token) shown once on create or rotate.</p>
              </div>
              {detailLoading && <Loader2 className="size-4 animate-spin text-white/40" />}
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1">
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Name</label>
                <Input
                  placeholder={`${selected}-api`}
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="border-white/15 bg-black/40 text-white"
                />
              </div>
              <div className="w-[140px]">
                <label className="mb-1 block text-[11px] uppercase tracking-wide text-white/40">Role</label>
                <Select value={sourceRole} onValueChange={(v) => setSourceRole(v as 'frontend' | 'backend')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="frontend">frontend</SelectItem>
                    <SelectItem value="backend">backend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const name = sourceName.trim() || `${selected}-${sourceRole}`;
                    const res = await createSource({
                      role: sourceRole,
                      service: sourceRole === 'frontend' ? 'web' : 'api',
                      name,
                      provider: 'http',
                    });
                    if (res.token) showToken(res.token, name, res.intakeUrl);
                    toast.success('Source created — copy the API key now');
                    setSourceName('');
                    await reloadDetail();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <KeyRound className="mr-1 size-3.5" />
                Generate source key
              </Button>
            </div>

            <ul className="mt-4 divide-y divide-white/5">
              {sources.length === 0 && <li className="py-2 text-xs text-white/45">No sources yet.</li>}
              {sources.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white/90">{s.name}</p>
                    <p className="text-[11px] text-white/40">
                      {s.role}/{s.service} · {s.provider}
                      {s.lastEventAt ? (
                        <span className="ml-2 text-emerald-400/80">receiving</span>
                      ) : (
                        <span className="ml-2 text-amber-300/70">waiting for first event</span>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15"
                    disabled={busy || s.provider === 'vercel'}
                    onClick={async () => {
                      if (!confirm(`Rotate API key for “${s.name}”? The old token stops working immediately.`)) return;
                      setBusy(true);
                      try {
                        const res = await rotateToken(s.id);
                        if (res.token) showToken(res.token, s.name, res.intakeUrl);
                        toast.success('New API key issued');
                        await reloadDetail();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Rotate failed');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <RefreshCw className="mr-1 size-3.5" />
                    Rotate key
                  </Button>
                </li>
              ))}
            </ul>

            {lastToken && (
              <div className="mt-4 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-emerald-200/90">API key for {lastToken.sourceName} (shown once)</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-emerald-300/90">{lastToken.token}</p>
                  </div>
                  <CopyButton value={lastToken.token} label="API key" />
                </div>
                <p className="mt-3 text-[11px] text-white/45">Env for your app:</p>
                <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-2 font-mono text-[10px] text-white/70">{`CALYX_INTAKE_URL=${lastToken.intakeUrl}
CALYX_SOURCE_TOKEN=${lastToken.token}`}</pre>
                <div className="mt-2 flex justify-end">
                  <CopyButton
                    value={`CALYX_INTAKE_URL=${lastToken.intakeUrl}\nCALYX_SOURCE_TOKEN=${lastToken.token}`}
                    label="Env"
                  />
                </div>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-start gap-3">
              <GitBranch className="mt-0.5 size-4 text-white/45" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">GitHub repository</p>
                <p className="mt-1 text-xs text-white/45">
                  Install the Calyx GitHub App and pick a repo for commits and remediation PRs.
                </p>

                {github ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2">
                    <span className="text-sm text-white/90">{github.repo}</span>
                    <span className="text-[11px] text-emerald-400/80">connected</span>
                    <span className="text-[11px] text-white/35">
                      {github.connectedAt ? new Date(github.connectedAt).toLocaleString() : ''}
                    </span>
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
                          toast.success('GitHub disconnected');
                          await reloadDetail();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Disconnect failed');
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
                  <Button
                    className="mt-3"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const returnTo =
                          typeof window !== 'undefined'
                            ? `${window.location.origin}/workspace/${workspaceId}/projects/${encodeURIComponent(selected!)}`
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
                    <GitBranch className="mr-1 size-4" />
                    Connect repository
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {detail?.project?.id && (
            <Card>
              <p className="text-sm font-medium">Share this project</p>
              <p className="mt-1 text-xs text-white/45">
                Invite someone to <strong className="font-medium text-white/70">{selected}</strong> only. They get a workspace named after
                the project in their switcher — not your full workspace.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  type="email"
                  placeholder="ishika@company.com"
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
                        projectId: detail.project.id,
                        projectSlug: detail.project.slug || selected,
                        projectName: detail.project.name || selected,
                      });
                      toast.success(
                        res.invite.status === 'added'
                          ? `Shared — they now see “${res.workspace.name}” in their switcher`
                          : `Invite saved for ${shareEmail.trim()} — they get “${res.workspace.name}” on login`,
                      );
                      setShareEmail('');
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Share failed');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Share project
                </Button>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
