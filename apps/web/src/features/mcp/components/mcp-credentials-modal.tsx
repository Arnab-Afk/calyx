'use client';

import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Check, Copy, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { Id } from '@/../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/use-confirm';
import { chatApi } from '@/lib/chat-api';

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
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-white/10 bg-[#111315] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-red-400" />
              Coding-agent connectors
            </DialogTitle>
            <DialogDescription className="text-white/55">
              Create scoped credentials for Claude Code, Codex, Pi, Cursor, and other MCP clients.
            </DialogDescription>
          </DialogHeader>

          {created && (
            <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4">
              <p className="font-semibold text-amber-200">Copy this token now</p>
              <p className="mt-1 text-sm text-amber-100/70">It is shown once. Calyx stores only its hash.</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded bg-black/40 p-3 text-xs text-amber-100">{created.token}</code>
                <Button type="button" size="icon" variant="outline" onClick={copyToken}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <div className="mt-3 rounded bg-black/30 p-3 text-xs text-amber-100/75">
                <span className="font-semibold">Streamable HTTP endpoint:</span> <code>{mcpUrl}</code>
              </div>
            </section>
          )}

          <form
            onSubmit={handleCreate}
            className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-[1fr_140px_auto]"
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={1}
              maxLength={80}
              required
              placeholder="Claude Code on MacBook"
              className="border-white/10 bg-black/30"
            />
            <Input
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              type="number"
              min={1}
              max={365}
              required
              aria-label="Expiry in days"
              className="border-white/10 bg-black/30"
            />
            <Button disabled={loading} className="gap-2 bg-red-600 hover:bg-red-500">
              <Plus className="size-4" />
              Create
            </Button>
          </form>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-white/55">Workspace credentials</h3>
              <Button type="button" size="iconSm" variant="transparent" onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="space-y-2">
              {credentials.length === 0 && !loading && (
                <p className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-white/45">
                  No connector credentials yet.
                </p>
              )}
              {credentials.map((credential) => (
                <div
                  key={credential.credentialId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{credential.name}</p>
                    <p className="text-xs text-white/45">
                      Created {new Date(credential.createdAt).toLocaleDateString()} ·{' '}
                      {credential.lastUsedAt ? `used ${new Date(credential.lastUsedAt).toLocaleString()}` : 'never used'}
                    </p>
                    {credential.revokedAt && <p className="mt-1 text-xs font-semibold text-red-400">Revoked</p>}
                  </div>
                  {!credential.revokedAt && (
                    <Button
                      type="button"
                      size="iconSm"
                      variant="transparent"
                      disabled={loading}
                      onClick={() => void handleRevoke(credential.credentialId)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <VisuallyHidden.Root>
            <DialogDescription>Manage MCP connector credentials for this workspace.</DialogDescription>
          </VisuallyHidden.Root>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
