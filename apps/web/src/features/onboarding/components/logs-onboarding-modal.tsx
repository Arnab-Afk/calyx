'use client';

import {
  AppWindow,
  Box,
  Check,
  ChevronRight,
  Cloud,
  Code2,
  Copy,
  FolderKanban,
  Globe,
  Layers,
  Loader2,
  MessageSquare,
  Plug,
  Server,
  Sparkles,
  Triangle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCreateChannel } from '@/features/channels/api/use-create-channel';
import { opsFetch } from '@/features/control/api/use-ops';
import { cn } from '@/lib/utils';

import { APP_TYPES, type AppTypeId, fillTutorial, slugify } from '../lib/app-types';
import { useLogsOnboarding } from '../store/use-logs-onboarding';

type Step = 'welcome' | 'app' | 'project' | 'sources' | 'tutorial' | 'done';
type Stage = 'workspace' | 'stack' | 'project' | 'connect' | 'ask';

const INTAKE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CALYX_INTAKE_URL?.replace(/\/$/, '')) ||
  'https://calyx-intake.arnabbhowmik.in';

const STAGE_ORDER: Stage[] = ['workspace', 'stack', 'project', 'connect', 'ask'];

const STAGES: { id: Stage; title: string; blurb: string; icon: typeof MessageSquare }[] = [
  { id: 'workspace', title: 'Workspace', blurb: 'Team chat. This one is already live.', icon: MessageSquare },
  { id: 'stack', title: 'Stack', blurb: 'What you’re shipping, so sources match.', icon: Layers },
  { id: 'project', title: 'Project + sources', blurb: 'Where frontend and backend logs land.', icon: FolderKanban },
  { id: 'connect', title: 'Connect', blurb: 'Paste a token and send a first event.', icon: Plug },
  { id: 'ask', title: 'Ask Calyx', blurb: 'Investigate in the thread — no dashboard.', icon: Sparkles },
];

const STACK_ICONS: Record<AppTypeId, typeof Globe> = {
  nextjs: Globe,
  node: Server,
  python: Code2,
  browser: AppWindow,
  docker: Box,
  journald: Server,
  cloudwatch: Cloud,
  vercel: Triangle,
  other: Box,
};

function stepToStage(step: Step): Stage {
  if (step === 'welcome') return 'workspace';
  if (step === 'app') return 'stack';
  if (step === 'project' || step === 'sources') return 'project';
  if (step === 'tutorial') return 'connect';
  return 'ask';
}

function stageToStep(stage: Stage, hasTutorial: boolean): Step {
  if (stage === 'workspace') return 'welcome';
  if (stage === 'stack') return 'app';
  if (stage === 'project') return 'project';
  if (stage === 'connect') return hasTutorial ? 'tutorial' : 'project';
  return hasTutorial ? 'done' : 'project';
}

export function LogsOnboardingModal() {
  const router = useRouter();
  const { open, workspaceId, close } = useLogsOnboarding();
  const { mutate: createChannel } = useCreateChannel();

  const [step, setStep] = useState<Step>('welcome');
  const [appType, setAppType] = useState<AppTypeId | null>(null);
  const [projectSlug, setProjectSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [frontendToken, setFrontendToken] = useState('');
  const [backendToken, setBackendToken] = useState('');
  const [drainUrl, setDrainUrl] = useState('');
  const [createdSources, setCreatedSources] = useState<string[]>([]);
  const [session, setSession] = useState(0);

  const selected = useMemo(() => APP_TYPES.find((a) => a.id === appType) ?? null, [appType]);
  const stage = stepToStage(step);
  const stageRank = STAGE_ORDER.indexOf(stage);
  const hasTutorial =
    createdSources.length > 0 ||
    Boolean(frontendToken || backendToken || drainUrl) ||
    appType === 'journald';


  const reset = () => {
    setStep('welcome');
    setAppType(null);
    setProjectSlug('');
    setBusy(false);
    setFrontendToken('');
    setBackendToken('');
    setDrainUrl('');
    setCreatedSources([]);
  };

  useEffect(() => {
    if (open) {
      reset();
      setSession((n) => n + 1);
    }
    // Reset only when the modal opens, not on every workspaceId tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId]);

  const handleClose = (forceDone = false) => {
    close({ done: forceDone });
    reset();
  };

  const finish = () => {
    if (!workspaceId) return;
    createChannel(
      { name: 'general', workspaceId: workspaceId as never },
      {
        onSuccess: (channelId) => {
          close({ done: true });
          reset();
          if (channelId) router.push(`/workspace/${workspaceId}/channel/${channelId}`);
          else router.push(`/workspace/${workspaceId}`);
          toast.success('You’re in — ask Calyx once logs start flowing.');
        },
        onError: () => {
          close({ done: true });
          reset();
          router.push(`/workspace/${workspaceId}`);
          toast.message('Workspace ready. Create a channel from the sidebar.');
        },
      },
    );
  };

  const createProjectAndSources = async () => {
    if (!workspaceId || !selected) return;
    const slug = slugify(projectSlug || selected.id);
    setBusy(true);
    setStep('sources');
    try {
      await opsFetch(workspaceId, 'projects', {
        method: 'POST',
        body: JSON.stringify({ name: slug, slug, environment: 'production' }),
      });
      setProjectSlug(slug);

      const names: string[] = [];
      let fe = '';
      let be = '';
      let drain = '';
      for (const plan of selected.sources) {
        const res = await opsFetch<{
          source?: { name?: string; id?: string };
          token?: string;
          drainUrl?: string;
        }>(workspaceId, `projects/${encodeURIComponent(slug)}/sources`, {
          method: 'POST',
          body: JSON.stringify({
            role: plan.role,
            service: plan.service,
            name: `${slug}-${plan.name}`,
            provider: plan.provider,
          }),
        });
        names.push(res.source?.name ?? plan.name);
        if (plan.role === 'frontend' && res.token) fe = res.token;
        if ((plan.role === 'backend' || plan.role === 'other') && res.token) be = res.token;
        if (res.drainUrl) drain = res.drainUrl;
        else if (plan.provider === 'cloudwatch' && res.source?.id) {
          drain = `${INTAKE}/v1/drains/cloudwatch/${res.source.id}`;
        }
      }
      setCreatedSources(names);
      setFrontendToken(fe);
      setBackendToken(be);
      setDrainUrl(drain);
      setStep('tutorial');
      toast.success(
        selected.id === 'journald'
          ? 'Project ready — run the journal command on your VM'
          : selected.id === 'cloudwatch'
            ? 'CloudWatch source ready — copy the drain URL + token'
            : 'Project + sources ready',
      );
    } catch (e) {
      setStep('project');
      toast.error(e instanceof Error ? e.message : 'Could not create project');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const goStage = (next: Stage) => {
    const nextRank = STAGE_ORDER.indexOf(next);
    if (nextRank > stageRank) return;
    setStep(stageToStep(next, hasTutorial));
  };

  const primary = (() => {
    if (step === 'welcome') return { label: 'Continue', action: () => setStep('app'), disabled: false };
    if (step === 'app') return { label: 'Continue', action: () => setStep('project'), disabled: !appType };
    if (step === 'project' || step === 'sources')
      return {
        label: busy ? 'Creating…' : 'Create project',
        action: () => void createProjectAndSources(),
        disabled: busy || !selected || projectSlug.trim().length < 2,
      };
    if (step === 'tutorial') return { label: 'I’ve connected logs', action: () => setStep('done'), disabled: false };
    return { label: 'Enter workspace', action: finish, disabled: false };
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose(false);
      }}
    >
      <DialogContent
        className={cn(
          'h-[min(640px,90vh)] w-[calc(100%-1.5rem)] max-w-[980px] gap-0 overflow-hidden border-white/10 bg-[#0c0c10] p-0 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:rounded-3xl',
          '[&>button]:right-5 [&>button]:top-5 [&>button]:text-white/45 [&>button]:hover:text-white',
        )}
      >
        <DialogTitle className="sr-only">Set up observability</DialogTitle>
        <DialogDescription className="sr-only">
          Connect logs so Calyx can investigate real incidents in your workspace.
        </DialogDescription>

        <div className="flex h-full min-h-0">
          <aside className="hidden w-[340px] shrink-0 flex-col border-r border-white/10 md:flex">
            <div className="px-8 pb-6 pt-8">
              <div className="mb-8 flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/calyx-avatar.png" alt="" width={28} height={28} className="size-7" />
                <span className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">Calyx</span>
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-[22px] font-semibold leading-tight tracking-tight">
                Welcome to Calyx.
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                Connect logs so Calyx can investigate real incidents from the same channel.
              </p>
            </div>

            <nav className="flex-1 space-y-0.5 overflow-y-auto px-4 pb-4">
              {STAGES.map((item, i) => {
                const Icon = item.icon;
                const active = item.id === stage;
                const complete = i < stageRank;
                const locked = i > stageRank;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={locked}
                    onClick={() => goStage(item.id)}
                    className={cn(
                      'relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition',
                      active && 'bg-white/[0.06]',
                      !active && !locked && 'hover:bg-white/[0.03]',
                      locked && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute bottom-2.5 left-0 top-2.5 w-px bg-[var(--sazabi-crimson)]"
                      />
                    )}
                    <span
                      className={cn(
                        'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]',
                        active && 'border-[var(--sazabi-crimson)]/40 bg-[var(--sazabi-crimson)]/10',
                        complete && !active && 'border-white/15',
                      )}
                    >
                      {complete && !active ? (
                        <Check className="size-4 text-[var(--sazabi-ok)]" />
                      ) : (
                        <Icon className={cn('size-4', active ? 'text-[var(--sazabi-crimson)]' : 'text-white/55')} />
                      )}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-[13px] font-semibold text-white">{item.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-white/45">{item.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="px-8 py-5">
              <button
                type="button"
                onClick={() => handleClose(true)}
                className="text-[13px] text-white/40 transition hover:text-white/70"
              >
                Skip for now
              </button>
            </div>
          </aside>

          <section className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 md:hidden">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/calyx-avatar.png" alt="" width={20} height={20} className="size-5" />
                <span className="font-[family-name:var(--font-display)] text-sm font-semibold">Calyx</span>
              </div>
              <button type="button" onClick={() => handleClose(true)} className="text-[13px] text-white/40">
                Skip
              </button>
            </div>

            <div key={`${session}-${step}`} className="min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-10 md:py-9">
              {step === 'welcome' && <WorkspacePreview />}
              {step === 'app' && (
                <StackPicker
                  appType={appType}
                  onSelect={(id) => {
                    setAppType(id);
                    setProjectSlug(slugify(id === 'other' ? 'my-app' : id));
                  }}
                />
              )}
              {(step === 'project' || step === 'sources') && selected && (
                <ProjectForm
                  slug={projectSlug}
                  onSlug={setProjectSlug}
                  sources={selected.sources.map((s) => `${s.role}/${s.service}`)}
                  loading={step === 'sources' || busy}
                />
              )}
              {step === 'tutorial' && selected && (
                <ConnectPane
                  createdSources={createdSources}
                  frontendToken={frontendToken}
                  backendToken={backendToken}
                  drainUrl={drainUrl}
                  steps={selected.steps}
                  tutorialTitle={selected.tutorialTitle}
                  onCopy={(text) => void copy(text)}
                />
              )}
              {step === 'done' && <AskPreview />}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 px-6 py-4 md:px-10">
              {step !== 'welcome' && step !== 'done' && step !== 'sources' && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto text-white/45 hover:bg-white/5 hover:text-white"
                  onClick={() => {
                    if (step === 'app') setStep('welcome');
                    else if (step === 'project') setStep('app');
                    else if (step === 'tutorial') setStep('project');
                  }}
                >
                  Back
                </Button>
              )}
              <Button
                type="button"
                disabled={primary.disabled}
                onClick={primary.action}
                className="h-10 rounded-full bg-[var(--sazabi-crimson)] px-5 text-white hover:bg-[#c91828]"
              >
                {busy && (step === 'project' || step === 'sources') ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    {primary.label}
                    <ChevronRight className="ml-1 size-4" />
                  </>
                )}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkspacePreview() {
  return (
    <div>
      <PreviewWell>
        <div className="space-y-4">
          <p className="text-[11px] font-medium text-white/35">#general</p>
          <ChatRow name="Hadley" time="17:24" body="checkout is 500ing for EU — anyone seeing this?" />
          <ChatRow
            name="Calyx"
            time="17:24"
            app
            body="Error spike on checkout-api. Deploy api@7f3a1c lined up with the 5xx jump. Impact: ~12% of payments failing."
          />
        </div>
      </PreviewWell>
      <h3 className="mt-8 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
        Incidents stay in the thread
      </h3>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/50">
        Your workspace is ready. Next we wire a project so Calyx can read real logs — then you ask in chat, not a dashboard.
      </p>
    </div>
  );
}

function StackPicker({ appType, onSelect }: { appType: AppTypeId | null; onSelect: (id: AppTypeId) => void }) {
  return (
    <div>
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">What are you shipping?</h3>
      <p className="mt-2 mb-6 max-w-md text-[14px] leading-relaxed text-white/50">
        We’ll create matching log sources and a short connect tutorial for that stack.
      </p>
      <div className="space-y-1">
        {APP_TYPES.map((a) => {
          const Icon = STACK_ICONS[a.id];
          const active = appType === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition',
                active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10',
                  active && 'border-[var(--sazabi-crimson)]/40 bg-[var(--sazabi-crimson)]/10',
                )}
              >
                <Icon className={cn('size-4', active ? 'text-[var(--sazabi-crimson)]' : 'text-white/55')} />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-[13px] font-semibold">{a.title}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-white/45">{a.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectForm({
  slug,
  onSlug,
  sources,
  loading,
}: {
  slug: string;
  onSlug: (v: string) => void;
  sources: string[];
  loading: boolean;
}) {
  return (
    <div>
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">Name your project</h3>
      <p className="mt-2 mb-6 max-w-md text-[14px] leading-relaxed text-white/50">
        A project groups the sources Calyx will watch. We’ll create {sources.join(' and ')}.
      </p>
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-white/50">
          <Loader2 className="size-6 animate-spin text-[var(--sazabi-crimson)]" />
          <p className="text-sm">Provisioning project and log sources…</p>
        </div>
      ) : (
        <div>
          <label htmlFor="project-slug" className="text-sm font-medium text-white">
            Project slug
          </label>
          <Input
            id="project-slug"
            className="mt-2 h-12 border-white/10 bg-[#141416] text-white placeholder:text-white/35 focus-visible:border-[var(--sazabi-crimson)] focus-visible:ring-[var(--sazabi-crimson)]"
            value={slug}
            onChange={(e) => onSlug(e.target.value)}
            placeholder="my-app"
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

function ConnectPane({
  createdSources,
  frontendToken,
  backendToken,
  drainUrl,
  steps,
  tutorialTitle,
  onCopy,
}: {
  createdSources: string[];
  frontendToken: string;
  backendToken: string;
  drainUrl?: string;
  steps: { title: string; body?: string; code?: string }[];
  tutorialTitle: string;
  onCopy: (text: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">{tutorialTitle}</h3>
        <p className="mt-2 text-[14px] leading-relaxed text-white/50">
          {drainUrl
            ? 'Copy the drain URL and token into AWS, then subscribe your log group.'
            : 'Tokens are shown once. Paste them into the app, then send a test event.'}
        </p>
      </div>

      {(frontendToken || backendToken || drainUrl) && (
        <div className="space-y-2 rounded-xl bg-black/40 px-4 py-3">
          <p className="text-[12px] font-medium text-white/60">
            {drainUrl ? 'CloudWatch drain credentials' : 'Source tokens'}
          </p>
          {drainUrl && <TokenRow label="Drain URL" value={drainUrl} onCopy={() => onCopy(drainUrl)} />}
          {frontendToken && <TokenRow label="Frontend" value={frontendToken} onCopy={() => onCopy(frontendToken)} />}
          {backendToken && (
            <TokenRow
              label={drainUrl ? 'Source token' : 'Backend'}
              value={backendToken}
              onCopy={() => onCopy(backendToken)}
            />
          )}
          {drainUrl && backendToken && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/55 p-2 font-mono text-[10px] text-white/60">{`CALYX_CLOUDWATCH_URL=${drainUrl}
CALYX_SOURCE_TOKEN=${backendToken}`}</pre>
          )}
          <p className="pt-1 font-mono text-[11px] text-white/35">Intake {INTAKE}</p>
        </div>
      )}

      {createdSources.length > 0 && (
        <p className="text-[12px] text-white/40">Created {createdSources.join(', ')}</p>
      )}

      <ol className="space-y-5">
        {steps.map((s, i) => {
          const code = s.code ? fillTutorial(s.code, { intake: INTAKE, frontendToken, backendToken }) : null;
          return (
            <li key={i}>
              <p className="text-[14px] font-semibold text-white">{s.title}</p>
              {s.body && <p className="mt-1 text-[13px] leading-relaxed text-white/45">{s.body}</p>}
              {code && (
                <div className="relative mt-2">
                  <pre className="overflow-x-auto rounded-lg bg-black/55 p-3 font-mono text-[11px] leading-relaxed text-[#d4edda]">
                    {code}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="absolute right-1 top-1 h-7 text-white/45 hover:text-white"
                    onClick={() => onCopy(code)}
                  >
                    <Copy className="size-3.5" />
                    <span className="sr-only">Copy</span>
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AskPreview() {
  return (
    <div>
      <PreviewWell>
        <div className="space-y-4">
          <ChatRow name="You" time="now" body="/calyx why are errors spiking?" />
          <ChatRow
            name="Calyx"
            time="now"
            app
            body="Checkout 5xx jumped 18× in 4 minutes. Start in the thread — I’ll attach the chart."
          />
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-white/45">
            /calyx why are errors spiking?
          </div>
        </div>
      </PreviewWell>
      <h3 className="mt-8 font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">You’re ready</h3>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/50">
        We’ll open <span className="text-white/80">#general</span>. Once events arrive, ask in the channel. Revisit sources anytime in
        Settings
        <ChevronRight className="mx-0.5 inline size-3.5 align-text-bottom text-white/35" aria-hidden />
        Projects &amp; logs.
      </p>
    </div>
  );
}

function PreviewWell({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#161318] px-5 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 3px)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function ChatRow({ name, time, body, app }: { name: string; time: string; body: string; app?: boolean }) {
  return (
    <div className="flex gap-2.5">
      {app ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/calyx-avatar.png" alt="" width={28} height={28} className="mt-0.5 size-7 shrink-0 rounded-[5px]" />
      ) : (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[5px] bg-[var(--sazabi-crimson)]/25 text-[11px] font-semibold text-white">
          {name.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-white">
          {name}
          {app && (
            <span className="ml-1.5 align-middle text-[9px] font-semibold tracking-[0.12em] text-white/35">APP</span>
          )}
          <span className="ml-2 text-[11px] font-normal text-white/30">{time}</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-white/65">{body}</p>
      </div>
    </div>
  );
}

function TokenRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-[11px] uppercase tracking-wide text-white/40">{label}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-[#d4edda]">{value}</code>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 text-white/45 hover:text-white" onClick={onCopy}>
        <Copy className="size-3.5" />
        <span className="sr-only">Copy {label} token</span>
      </Button>
    </div>
  );
}
