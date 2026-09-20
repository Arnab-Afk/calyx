'use client';

import { Check, ChevronRight, Copy, Loader2, Rocket } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCreateChannel } from '@/features/channels/api/use-create-channel';
import { opsFetch } from '@/features/control/api/use-ops';
import { cn } from '@/lib/utils';

import { APP_TYPES, type AppTypeId, fillTutorial, slugify } from '../lib/app-types';
import { useLogsOnboarding } from '../store/use-logs-onboarding';

type Step = 'welcome' | 'app' | 'project' | 'sources' | 'tutorial' | 'done';

const INTAKE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CALYX_INTAKE_URL?.replace(/\/$/, '')) ||
  'https://calyx-intake.arnabbhowmik.in';

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
  const [createdSources, setCreatedSources] = useState<string[]>([]);

  const selected = useMemo(() => APP_TYPES.find((a) => a.id === appType) ?? null, [appType]);

  const reset = () => {
    setStep('welcome');
    setAppType(null);
    setProjectSlug('');
    setBusy(false);
    setFrontendToken('');
    setBackendToken('');
    setCreatedSources([]);
  };

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
    try {
      await opsFetch(workspaceId, 'projects', {
        method: 'POST',
        body: JSON.stringify({ name: slug, slug, environment: 'production' }),
      });
      setProjectSlug(slug);

      const names: string[] = [];
      let fe = '';
      let be = '';
      for (const plan of selected.sources) {
        const res = await opsFetch<{ source?: { name?: string }; token?: string }>(
          workspaceId,
          `projects/${encodeURIComponent(slug)}/sources`,
          {
            method: 'POST',
            body: JSON.stringify({
              role: plan.role,
              service: plan.service,
              name: `${slug}-${plan.name}`,
              provider: plan.provider,
            }),
          },
        );
        names.push(res.source?.name ?? plan.name);
        if (plan.role === 'frontend' && res.token) fe = res.token;
        if (plan.role === 'backend' && res.token) be = res.token;
      }
      setCreatedSources(names);
      setFrontendToken(fe);
      setBackendToken(be);
      setStep('tutorial');
      toast.success('Project + sources ready');
    } catch (e) {
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

  const stepIndex = (['welcome', 'app', 'project', 'sources', 'tutorial', 'done'] as Step[]).indexOf(step);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose(false);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-white/10 bg-[#0c0c10] text-white sm:rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl">
            {step === 'welcome' && 'Set up observability'}
            {step === 'app' && 'What are you shipping?'}
            {step === 'project' && 'Name your project'}
            {step === 'sources' && 'Creating log sources'}
            {step === 'tutorial' && (selected?.tutorialTitle ?? 'Connect logs')}
            {step === 'done' && 'You’re ready'}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {step === 'welcome' && 'After your workspace, connect logs so Calyx can investigate real incidents.'}
            {step === 'app' && 'We’ll tailor sources and a short connect tutorial to your stack.'}
            {step === 'project' && 'A project groups frontend + backend sources for one app.'}
            {step === 'tutorial' && 'Tokens are shown once — paste them into your app, then send a test event.'}
            {step === 'done' && 'Jump into chat and ask Calyx about errors once events arrive.'}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn('h-1 flex-1 rounded-full', i <= Math.min(stepIndex, 4) ? 'bg-[var(--sazabi-crimson)]' : 'bg-white/10')}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Rocket className="mt-0.5 size-5 text-[var(--sazabi-crimson)]" />
                <div className="space-y-2 text-sm text-white/70">
                  <p>
                    <strong className="text-white">1. Workspace</strong> — done. This is your team chat.
                  </p>
                  <p>
                    <strong className="text-white">2. Project + sources</strong> — where logs land (frontend / backend).
                  </p>
                  <p>
                    <strong className="text-white">3. Connect</strong> — SDK, curl, or a platform drain.
                  </p>
                  <p>
                    <strong className="text-white">4. Ask</strong> — in chat: <code className="text-white/80">/calyx why are errors spiking?</code>
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" className="text-white/50" onClick={() => handleClose(true)}>
                Skip for now
              </Button>
              <Button onClick={() => setStep('app')}>
                Continue
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'app' && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {APP_TYPES.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAppType(a.id);
                    setProjectSlug(slugify(a.id === 'other' ? 'my-app' : a.id));
                  }}
                  className={cn(
                    'rounded-xl border p-4 text-left transition',
                    appType === a.id
                      ? 'border-[var(--sazabi-crimson)]/60 bg-[var(--sazabi-crimson)]/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20',
                  )}
                >
                  <p className="text-sm font-medium text-white">{a.title}</p>
                  <p className="mt-1 text-xs text-white/50">{a.blurb}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" className="text-white/50" onClick={() => setStep('welcome')}>
                Back
              </Button>
              <Button disabled={!appType} onClick={() => setStep('project')}>
                Continue
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'project' && selected && (
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-white/40">Project slug</label>
              <Input
                className="mt-2 border-white/15 bg-black/40 text-white"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                placeholder="my-app"
              />
              <p className="mt-2 text-xs text-white/45">
                We’ll create:{' '}
                {selected.sources.map((s) => `${s.role}/${s.service}`).join(' · ')}
              </p>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" className="text-white/50" onClick={() => setStep('app')}>
                Back
              </Button>
              <Button
                disabled={busy || projectSlug.trim().length < 2}
                onClick={async () => {
                  setStep('sources');
                  await createProjectAndSources();
                }}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : 'Create project & sources'}
              </Button>
            </div>
          </div>
        )}

        {step === 'sources' && (
          <div className="flex flex-col items-center gap-3 py-10 text-white/60">
            <Loader2 className="size-6 animate-spin text-[var(--sazabi-crimson)]" />
            <p className="text-sm">Provisioning project and log sources…</p>
          </div>
        )}

        {step === 'tutorial' && selected && (
          <div className="space-y-4">
            {createdSources.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100/90">
                <p className="font-medium text-emerald-200">Created</p>
                <ul className="mt-1 list-inside list-disc text-emerald-100/70">
                  {createdSources.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}

            {(frontendToken || backendToken) && (
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/40 p-3">
                <p className="text-xs font-medium text-white/70">Source tokens (copy now — shown once)</p>
                {frontendToken && (
                  <TokenRow label="Frontend" value={frontendToken} onCopy={() => void copy(frontendToken)} />
                )}
                {backendToken && (
                  <TokenRow label="Backend" value={backendToken} onCopy={() => void copy(backendToken)} />
                )}
                <p className="text-[11px] text-white/40">Intake: {INTAKE}</p>
              </div>
            )}

            <div className="space-y-3">
              {selected.steps.map((s, i) => {
                const code = s.code
                  ? fillTutorial(s.code, { intake: INTAKE, frontendToken, backendToken })
                  : null;
                return (
                  <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-medium text-white">
                      {i + 1}. {s.title}
                    </p>
                    {s.body && <p className="mt-1 text-xs text-white/50">{s.body}</p>}
                    {code && (
                      <div className="relative mt-3">
                        <pre className="overflow-x-auto rounded-lg bg-black/60 p-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                          {code}
                        </pre>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="absolute right-1 top-1 h-7 text-white/50"
                          onClick={() => void copy(code)}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" className="text-white/50" onClick={() => setStep('project')}>
                Back
              </Button>
              <Button onClick={() => setStep('done')}>
                I’ve connected logs
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
              <p className="flex items-center gap-2 text-white">
                <Check className="size-4 text-emerald-400" />
                Next: open chat and ask Calyx
              </p>
              <p className="mt-2 text-xs text-white/50">
                We’ll create a <strong className="text-white/80">#general</strong> channel. Once events arrive, try{' '}
                <code className="text-white/75">/calyx any errors in the last hour?</code>
              </p>
              <p className="mt-2 text-xs text-white/40">
                You can revisit sources anytime in Settings → Projects &amp; logs.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button onClick={finish}>Enter workspace</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TokenRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-1 text-[11px] uppercase text-white/40">{label}</span>
      <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-emerald-300/90">{value}</code>
      <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 text-white/50" onClick={onCopy}>
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}
