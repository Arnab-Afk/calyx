'use client';

import { Check, Copy, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { Id } from '@/../convex/_generated/dataModel';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/use-confirm';
import { chatApi } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

interface Credential {
  credentialId: string;
  name: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

interface CreatedCredential {
  credentialId: string;
  token: string;
  name: string;
}

interface McpCredentialsModalProps {
  workspaceId: Id<'workspaces'>;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function McpCredentialsModal({ workspaceId, open, setOpen }: McpCredentialsModalProps) {
  const [ConfirmDialog, confirmRevoke] = useConfirm('Revoke this connector?', 'The coding agent will immediately lose access.');
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [created, setCreated] = useState<CreatedCredential | null>(null);
  const [name, setName] = useState('Coding agent');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const mcpUrl = process.env.NEXT_PUBLIC_CALYX_MCP_URL ?? 'http://localhost:13002/mcp';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCredentials((await chatApi.mcpCredentials(String(workspaceId))).credentials);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load connectors.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const credential = (await chatApi.createMcpCredential(String(workspaceId), name, Number.parseInt(expiresInDays, 10))).credential;
      setCreated(credential);
      setName('Coding agent');
      await refresh();
      toast.success('Connector credential created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create connector.');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (credentialId: string) => {
    if (!(await confirmRevoke())) return;
    setLoading(true);
    try {
      await chatApi.revokeMcpCredential(String(workspaceId), credentialId);
      await refresh();
      toast.success('Connector revoked.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke connector.');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    toast.success('Token copied.');
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <ConfirmDialog />
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setCreated(null);
          setOpen(nextOpen);
        }}
      >
        <DialogContent className="flex max-h-[min(85vh,40rem)] w-[calc(100vw-1.5rem)] min-w-0 max-w-lg flex-col gap-0 overflow-hidden border-[var(--sazabi-border-quiet)] bg-[#12090c] p-0 text-white shadow-[0_24px_64px_rgba(0,0,0,0.65)] sm:rounded-2xl">
          <DialogHeader className="shrink-0 space-y-2 px-6 pb-4 pt-6 pr-14 text-left">
            <DialogTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-tight">
              <KeyRound className="size-4 text-[var(--sazabi-crimson)]" />
              Coding-agent connectors
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-relaxed text-white/55">
              Scoped credentials for Claude Code, Codex, Pi, Cursor, and other MCP clients.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-6 pb-2">
            {created ? (
              <section className="sazabi-glass min-w-0 rounded-xl border border-[var(--sazabi-warn)]/25 bg-[var(--sazabi-warn)]/[0.08] p-4">
                <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-[var(--sazabi-warn)]">
                  Copy this token now
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-white/60">Shown once. Calyx stores only its hash.</p>
                <div className="mt-3 flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#f3e6c2]">
                    {created.token}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyToken()}
                    className="sazabi-btn-ghost inline-flex size-10 shrink-0 items-center justify-center rounded-lg"
                    aria-label={copied ? 'Copied' : 'Copy token'}
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
                <p className="mt-3 break-all rounded-lg bg-black/40 px-3 py-2.5 text-[11px] leading-relaxed text-white/60">
                  Streamable HTTP endpoint
                  <code className="mt-1 block break-all font-mono text-white/80">{mcpUrl}</code>
                </p>
              </section>
            ) : null}

            <form
              onSubmit={handleCreate}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/[0.08] bg-black/25 p-4"
            >
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1.5 block text-[12px] text-white/55">Name</span>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={1}
                    maxLength={80}
                    required
                    placeholder="Claude Code on MacBook"
                    className="h-10 min-w-0 border-white/10 bg-black/40 text-white placeholder:text-white/30"
                  />
                </label>
                <label className="w-full shrink-0 sm:w-[5.5rem]">
                  <span className="mb-1.5 block text-[12px] text-white/55">Days</span>
                  <Input
                    value={expiresInDays}
                    onChange={(event) => setExpiresInDays(event.target.value)}
                    type="number"
                    min={1}
                    max={365}
                    required
                    className="h-10 border-white/10 bg-black/40 text-white"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="sazabi-btn-primary inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 sm:w-auto sm:self-end sm:px-5"
              >
                <Plus className="size-4" />
                Create
              </button>
            </form>

            <section className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-white">
                  Workspace credentials
                </h3>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  className="inline-flex size-8 items-center justify-center rounded-md text-white/45 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                  aria-label="Refresh connectors"
                >
                  <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
                </button>
              </div>
              <div className="space-y-2">
                {credentials.length === 0 && !loading ? (
                  <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-white/45">
                    No connector credentials yet.
                  </p>
                ) : null}
                {credentials.map((credential) => (
                  <div
                    key={credential.credentialId}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-white">{credential.name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-white/45">
                        Created {new Date(credential.createdAt).toLocaleDateString()} ·{' '}
                        {credential.lastUsedAt ? `used ${new Date(credential.lastUsedAt).toLocaleString()}` : 'never used'}
                      </p>
                      {credential.revokedAt ? (
                        <p className="mt-1 text-[11px] font-semibold text-[var(--sazabi-crimson)]">Revoked</p>
                      ) : null}
                    </div>
                    {!credential.revokedAt ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void handleRevoke(credential.credentialId)}
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--sazabi-crimson)]/80 transition hover:bg-[var(--sazabi-crimson)]/10 hover:text-[var(--sazabi-crimson)] disabled:opacity-40"
                        aria-label={`Revoke ${credential.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="shrink-0 border-t border-white/[0.07] px-6 py-4">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="sazabi-btn-ghost ml-auto flex h-9 items-center rounded-lg px-4 text-[13px] font-medium"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
