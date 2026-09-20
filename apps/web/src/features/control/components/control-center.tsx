'use client';

import { FolderKanban, GitBranch, KeyRound, Loader2, Plug, Rocket, Settings2, Shield, UserRound, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useOpsProjects, useOpsSources } from '@/features/control/api/use-ops';
import { McpCredentialsModal } from '@/features/mcp/components/mcp-credentials-modal';
import { useCurrentMember } from '@/features/members/api/use-current-member';
import { useGetMembers } from '@/features/members/api/use-get-members';
import { useRemoveMember } from '@/features/members/api/use-remove-member';
import { useUpdateMember } from '@/features/members/api/use-update-member';
import { useGetWorkspace } from '@/features/workspaces/api/use-get-workspace';
import { useNewJoinCode } from '@/features/workspaces/api/use-new-join-code';
import { useRemoveWorkspace } from '@/features/workspaces/api/use-remove-workspace';
import { useUpdateWorkspace } from '@/features/workspaces/api/use-update-workspace';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { cn } from '@/lib/utils';

export type ControlSection = 'start' | 'profile' | 'workspace' | 'members' | 'projects' | 'connections';

const NAV: { id: ControlSection; label: string; icon: typeof UserRound }[] = [
  { id: 'start', label: 'Get started', icon: Rocket },
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'workspace', label: 'Workspace', icon: Settings2 },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'projects', label: 'Projects & logs', icon: FolderKanban },
  { id: 'connections', label: 'Connections', icon: Plug },
];

interface ControlCenterProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialSection?: ControlSection;
}

export function ControlCenter({ open, setOpen, initialSection = 'start' }: ControlCenterProps) {
  const [section, setSection] = useState<ControlSection>(initialSection);

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(720px,90vh)] w-full max-w-4xl gap-0 overflow-hidden border-white/10 bg-[#0c0c10] p-0 text-white shadow-2xl sm:rounded-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Calyx settings</DialogTitle>
          <DialogDescription>Manage profile, workspace, projects, and connections</DialogDescription>
        </DialogHeader>

        <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-[#08080b]">
          <div className="border-b border-white/10 px-4 py-4">
            <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.2em] text-white/45">Calyx</p>
            <p className="mt-1 text-sm font-medium text-white/90">Control center</p>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5 p-2">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition',
                    active ? 'bg-[var(--sazabi-crimson)]/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <Icon className="size-4 shrink-0 opacity-80" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto">
          {section === 'start' && <StartPanel onGo={setSection} />}
          {section === 'profile' && <ProfilePanel />}
          {section === 'workspace' && <WorkspacePanel onClose={() => setOpen(false)} />}
          {section === 'members' && <MembersPanel />}
          {section === 'projects' && <ProjectsPanel />}
          {section === 'connections' && <ConnectionsPanel />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-5">
      <h2 className="font-[family-name:var(--font-display)] text-lg tracking-wide text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/50">{subtitle}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('rounded-lg border border-white/10 bg-white/[0.03] p-4', className)}>{children}</div>;
}

function StartPanel({ onGo }: { onGo: (s: ControlSection) => void }) {
  const steps = [
    { id: 'profile' as const, title: 'Confirm your profile', body: 'Name and email for this account.' },
    { id: 'workspace' as const, title: 'Set up the workspace', body: 'Rename, invite, or rotate the join code.' },
    { id: 'projects' as const, title: 'Connect a project', body: 'Create a Calyx project and log sources.' },
    { id: 'connections' as const, title: 'Wire GitHub & agents', body: 'Repo webhooks and MCP credentials.' },
  ];

  return (
    <Panel title="Get started" subtitle="One place for chat, ops projects, and integrations — Slack-style.">
      {steps.map((step, i) => (
        <button
          key={step.id}
          type="button"
          onClick={() => onGo(step.id)}
          className="flex w-full items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--sazabi-crimson)]/25 font-[family-name:var(--font-display)] text-xs text-white">
            {i + 1}
          </span>
          <span>
            <span className="block text-sm font-medium text-white">{step.title}</span>
            <span className="mt-0.5 block text-xs text-white/50">{step.body}</span>
          </span>
        </button>
      ))}
    </Panel>
  );
}

function ProfilePanel() {
  const { user } = useChatAuth();

  if (!user) {
    return (
      <Panel title="Profile" subtitle="Your Calyx account">
        <Card>
          <p className="text-sm text-white/55">Sign in to view your profile.</p>
        </Card>
      </Panel>
    );
  }

  return (
    <Panel title="Profile" subtitle="Account details for this session">
      <Card className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarImage src={user.image} alt={user.name} />
          <AvatarFallback className="text-lg">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-base font-medium">{user.name}</p>
          <p className="text-sm text-white/50">{user.email}</p>
        </div>
      </Card>
      <Card>
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 size-4 text-white/45" />
          <div>
            <p className="text-sm font-medium">Sign-in methods</p>
            <p className="mt-1 text-xs text-white/45">
              Email &amp; password is live. Google / GitHub account linking for chat login is next — use Connections for GitHub{' '}
              <em>repo</em> webhooks today.
            </p>
          </div>
        </div>
      </Card>
    </Panel>
  );
}

function WorkspacePanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { data: workspace } = useGetWorkspace({ id: workspaceId });
  const { data: member } = useCurrentMember({ workspaceId });
  const { mutate: updateWorkspace, isPending: renaming } = useUpdateWorkspace();
  const { mutate: removeWorkspace, isPending: removing } = useRemoveWorkspace();
  const { mutate: rotateCode, isPending: rotating } = useNewJoinCode();
  const [name, setName] = useState('');

  useEffect(() => {
    if (workspace?.name) setName(workspace.name);
  }, [workspace?.name]);

  const isAdmin = member?.role === 'admin';

  return (
    <Panel title="Workspace" subtitle="Team space settings (Slack-style workspace)">
      <Card>
        <label className="text-xs uppercase tracking-wider text-white/40">Name</label>
        <div className="mt-2 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin || renaming}
            className="border-white/15 bg-black/40 text-white"
          />
          <Button
            disabled={!isAdmin || renaming || name.trim().length < 3}
            onClick={() =>
              updateWorkspace(
                { id: workspaceId, name: name.trim() },
                {
                  onSuccess: () => toast.success('Workspace renamed'),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Save
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Invite code</p>
            <p className="mt-1 font-mono text-lg tracking-widest text-[var(--sazabi-crimson)]">{workspace?.joinCode ?? '—'}</p>
          </div>
          <Button
            variant="outline"
            disabled={!isAdmin || rotating}
            onClick={() =>
              rotateCode(
                { workspaceId },
                {
                  onSuccess: () => toast.success('Join code rotated'),
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Rotate
          </Button>
        </div>
      </Card>

      {isAdmin && (
        <Card className="border-rose-500/30">
          <p className="text-sm font-medium text-rose-300">Danger zone</p>
          <p className="mt-1 text-xs text-white/45">Permanently delete this workspace and its channels.</p>
          <Button
            variant="destructive"
            className="mt-3"
            disabled={removing}
            onClick={() =>
              removeWorkspace(
                { id: workspaceId },
                {
                  onSuccess: () => {
                    toast.success('Workspace deleted');
                    onClose();
                    router.replace('/');
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Delete workspace
          </Button>
        </Card>
      )}
    </Panel>
  );
}

function MembersPanel() {
  const workspaceId = useWorkspaceId();
  const { data: me } = useCurrentMember({ workspaceId });
  const { data: members, isLoading } = useGetMembers({ workspaceId });
  const { mutate: updateMember } = useUpdateMember();
  const { mutate: removeMember } = useRemoveMember();
  const isAdmin = me?.role === 'admin';

  return (
    <Panel title="Members" subtitle="People in this workspace">
      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-white/40" />
        </div>
      )}
      {members?.map((m) => (
        <Card key={m._id} className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-9">
              <AvatarImage src={m.user?.image} />
              <AvatarFallback>{m.user?.name?.charAt(0)?.toUpperCase() ?? '?'}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.user?.name ?? 'Unknown'}</p>
              <p className="truncate text-xs text-white/45">{m.user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/55">
              {m.role}
            </span>
            {isAdmin && m._id !== me?._id && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateMember(
                      { id: m._id, role: m.role === 'admin' ? 'member' : 'admin' },
                      {
                        onSuccess: () => toast.success('Role updated'),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  {m.role === 'admin' ? 'Make member' : 'Make admin'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    removeMember(
                      { id: m._id },
                      {
                        onSuccess: () => toast.success('Member removed'),
                        onError: (e) => toast.error(e.message),
                      },
                    )
                  }
                >
                  Remove
                </Button>
              </>
            )}
          </div>
        </Card>
      ))}
    </Panel>
  );
}

function ProjectsPanel() {
  const { projects, loading, error, create, reload } = useOpsProjects();
  const [slug, setSlug] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { sources, createSource, connectGithub, reload: reloadSources } = useOpsSources(selected);
  const [busy, setBusy] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [githubRepo, setGithubRepo] = useState('');

  return (
    <Panel title="Projects & logs" subtitle="Observability projects live here — same surface as chat, no separate console.">
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
        <div className="mt-2 flex gap-2">
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
                await create(slug.trim().toLowerCase());
                toast.success('Project created');
                setSlug('');
                await reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Create failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            Create
          </Button>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-sm font-medium">Your projects</p>
        {loading && <Loader2 className="size-4 animate-spin text-white/40" />}
        {!loading && projects.length === 0 && <p className="text-xs text-white/45">No projects yet — create one above.</p>}
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
            <p className="text-sm font-medium">Log sources — {selected}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await createSource({
                      role: 'frontend',
                      service: 'web',
                      name: `${selected}-frontend`,
                      provider: 'http',
                    });
                    setLastToken(res.token ?? null);
                    toast.success('Frontend source created');
                    await reloadSources();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Add frontend source
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await createSource({
                      role: 'backend',
                      service: 'api',
                      name: `${selected}-backend`,
                      provider: 'http',
                    });
                    setLastToken(res.token ?? null);
                    toast.success('Backend source created');
                    await reloadSources();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Add backend source
              </Button>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-white/55">
              {sources.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.role}/{s.service} · {s.lastEventAt ? 'receiving' : 'waiting'}
                </li>
              ))}
            </ul>
            {lastToken && (
              <p className="mt-3 break-all rounded-md bg-black/50 p-2 font-mono text-[11px] text-emerald-300/90">
                Token (copy now): {lastToken}
              </p>
            )}
          </Card>

          <Card>
            <p className="text-sm font-medium">GitHub repo</p>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="owner/repo"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="border-white/15 bg-black/40 text-white"
              />
              <Button
                disabled={busy || !githubRepo.includes('/')}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await connectGithub(githubRepo.trim());
                    window.location.assign(res.installationUrl);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <GitBranch className="mr-1 size-4" />
                Connect
              </Button>
            </div>
          </Card>
        </>
      )}
    </Panel>
  );
}

function ConnectionsPanel() {
  const workspaceId = useWorkspaceId();
  const [mcpOpen, setMcpOpen] = useState(false);

  return (
    <Panel title="Connections" subtitle="Auth providers, agent connectors, and inbound integrations">
      <McpCredentialsModal workspaceId={workspaceId} open={mcpOpen} setOpen={setMcpOpen} />

      <Card>
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-4 text-white/45" />
          <div className="flex-1">
            <p className="text-sm font-medium">Coding-agent connectors (MCP)</p>
            <p className="mt-1 text-xs text-white/45">Claude Code, Cursor, Codex — workspace-scoped tokens.</p>
            <Button size="sm" className="mt-3" variant="outline" onClick={() => setMcpOpen(true)}>
              Manage MCP credentials
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <GitBranch className="mt-0.5 size-4 text-white/45" />
          <div>
            <p className="text-sm font-medium">GitHub</p>
            <p className="mt-1 text-xs text-white/45">
              Repo webhooks: use <strong className="font-medium text-white/70">Projects &amp; logs</strong>. Full GitHub App OAuth for login
              / code search is not enabled yet.
            </p>
          </div>
        </div>
      </Card>

      <Card className="opacity-80">
        <p className="text-sm font-medium">Google / GitHub sign-in</p>
        <p className="mt-1 text-xs text-white/45">
          Chat auth today is email + password. Social login for the same account will land here when OAuth apps are configured — no separate
          admin console.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" disabled>
            Connect Google
          </Button>
          <Button size="sm" variant="outline" disabled>
            Connect GitHub
          </Button>
        </div>
      </Card>
    </Panel>
  );
}
