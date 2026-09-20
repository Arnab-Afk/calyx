'use client';

import { Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useChatWorkspaces } from '@/features/workspaces/api/use-chat-workspaces';
import { cn } from '@/lib/utils';

const INTAKE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CALYX_INTAKE_URL?.replace(/\/$/, '')) ||
  'https://calyx-intake.arnabbhowmik.in';

function DeviceAuthorizeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useChatAuth();
  const { data: workspaces, isLoading: workspacesLoading } = useChatWorkspaces(Boolean(user));

  const initialCode = useMemo(() => (searchParams.get('user_code') || '').toUpperCase(), [searchParams]);
  const [userCode, setUserCode] = useState(initialCode);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const next = `/cli/device${initialCode ? `?user_code=${encodeURIComponent(initialCode)}` : ''}`;
      router.replace(`/auth?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, user, router, initialCode]);

  useEffect(() => {
    if (!workspaceId && workspaces.length === 1) {
      setWorkspaceId(workspaces[0]!.id);
    }
  }, [workspaces, workspaceId]);

  async function approve() {
    if (!userCode.trim() || !workspaceId) {
      toast.error('Pick a workspace and enter the code from your terminal');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/cli/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: userCode.trim(), workspace_id: workspaceId }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || `Authorize failed (${res.status})`);
      }
      setDone(true);
      toast.success('CLI authorized — return to your terminal');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Authorize failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[var(--sazabi-void)] text-white/70">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--sazabi-void)] px-6 py-16 text-white">
      <div className="w-full max-w-md space-y-8">
        <div>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight">Calyx</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight">
            Authorize CLI
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            A VM is asking to ship journalctl logs into this workspace. Confirm the code matches your terminal, pick a
            workspace, then approve.
          </p>
        </div>

        {done ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Approved. Switch back to the terminal — it will list projects and running services next.
          </div>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-wide text-white/50">Device code</span>
              <Input
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                className="font-mono tracking-widest"
                autoComplete="off"
              />
            </label>

            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wide text-white/50">Workspace</span>
              {workspacesLoading ? (
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : workspaces.length === 0 ? (
                <p className="text-sm text-white/60">
                  No workspaces yet. <Link href="/">Create one</Link> first.
                </p>
              ) : (
                <ul className="space-y-2">
                  {workspaces.map((ws) => (
                    <li key={ws.id}>
                      <button
                        type="button"
                        onClick={() => setWorkspaceId(ws.id)}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                          workspaceId === ws.id
                            ? 'border-white/40 bg-white/10'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/25',
                        )}
                      >
                        {ws.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button
              type="button"
              disabled={submitting || !workspaceId || !userCode.trim()}
              onClick={() => void approve()}
              className="w-full"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : 'Authorize this CLI'}
            </Button>
          </>
        )}

        <p className="text-xs text-white/40">
          Intake: {INTAKE}. You can close this tab after approval.
        </p>
      </div>
    </div>
  );
}

export default function CliDevicePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[var(--sazabi-void)] text-white/70">
          <Loader2 className="size-5 animate-spin" />
        </div>
      }
    >
      <DeviceAuthorizeInner />
    </Suspense>
  );
}
