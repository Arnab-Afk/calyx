'use client';

import { FolderKanban, Loader2, MessageSquare, Plus, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useOpsProjects } from '@/features/control/api/use-ops';
import { useGetChannels } from '@/features/channels/api/use-get-channels';
import { useGetWorkspace } from '@/features/workspaces/api/use-get-workspace';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { cn } from '@/lib/utils';

export function OverviewPage() {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { data: workspace } = useGetWorkspace({ id: workspaceId });
  const { projects, loading, error } = useOpsProjects();
  const { data: channels } = useGetChannels({ workspaceId });
  const firstChannel = channels?.[0]?._id;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0c] text-white">
      <div className="relative border-b border-white/10">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 10% -20%, rgba(225,29,46,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 0%, rgba(94,200,255,0.08), transparent 50%)',
          }}
        />
        <div className="relative mx-auto max-w-5xl px-6 py-10">
          <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.22em] text-white/40">
            Workspace
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-tight text-white md:text-4xl">
            {workspace?.name ?? '…'}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/50">
            Projects, logs, and chat in one place — same Slack-style chrome, ops-first dashboard.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              className="bg-[var(--sazabi-crimson)] text-white hover:bg-[var(--sazabi-crimson)]/90"
              onClick={() => router.push(`/workspace/${workspaceId}/projects`)}
            >
              <Plus className="mr-1.5 size-4" />
              New project
            </Button>
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/5"
              onClick={() => {
                if (firstChannel) router.push(`/workspace/${workspaceId}/channel/${firstChannel}`);
                else router.push(`/workspace/${workspaceId}/chat`);
              }}
            >
              <MessageSquare className="mr-1.5 size-4" />
              Open chat
            </Button>
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-white hover:bg-white/5"
              onClick={() => router.push(`/workspace/${workspaceId}/settings`)}
            >
              <Settings2 className="mr-1.5 size-4" />
              Settings
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <section>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-sm uppercase tracking-[0.18em] text-white/45">
                Projects
              </h2>
              <p className="mt-1 text-sm text-white/55">Observability apps linked to this workspace.</p>
            </div>
            <Link
              href={`/workspace/${workspaceId}/projects`}
              className="text-xs text-white/45 underline-offset-4 hover:text-white hover:underline"
            >
              View all
            </Link>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
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
            <button
              type="button"
              onClick={() => router.push(`/workspace/${workspaceId}/projects`)}
              className="flex w-full flex-col items-start gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-5 py-8 text-left transition hover:border-white/25 hover:bg-white/[0.04]"
            >
              <FolderKanban className="size-5 text-white/35" />
              <span className="font-[family-name:var(--font-display)] text-base text-white">Create your first project</span>
              <span className="text-sm text-white/45">Connect logs and a GitHub repo to start asking Calyx.</span>
            </button>
          )}

          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/workspace/${workspaceId}/projects?project=${encodeURIComponent(project.slug)}`}
                  className={cn(
                    'group block rounded-xl border border-white/10 bg-white/[0.03] p-4 transition',
                    'hover:border-white/20 hover:bg-white/[0.05]',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-[family-name:var(--font-display)] text-base text-white group-hover:text-white">
                        {project.name || project.slug}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-white/40">{project.slug}</p>
                    </div>
                    <span className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/45">
                      {project.environment ?? 'prod'}
                    </span>
                  </div>
                  <p className="mt-4 text-xs text-white/40">Open to manage sources, API keys, and GitHub.</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          {[
            {
              title: 'Chat',
              body: 'Channels and Calyx answers live here.',
              href: firstChannel
                ? `/workspace/${workspaceId}/channel/${firstChannel}`
                : `/workspace/${workspaceId}/chat`,
            },
            {
              title: 'Projects & logs',
              body: 'Source tokens, intake status, repo connect.',
              href: `/workspace/${workspaceId}/projects`,
            },
            {
              title: 'Team',
              body: 'Invite members to the whole workspace.',
              href: `/workspace/${workspaceId}/settings?section=members`,
            },
          ].map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <p className="font-[family-name:var(--font-display)] text-sm text-white">{card.title}</p>
              <p className="mt-1 text-xs text-white/45">{card.body}</p>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
