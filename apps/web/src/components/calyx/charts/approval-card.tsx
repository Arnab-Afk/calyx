'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { opsFetch } from '@/features/control/api/use-ops';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { cn } from '@/lib/utils';

export interface ApprovalCardData {
  remediationRequestId?: string;
  remediation_request_id?: string;
  action: string;
  target: string;
  risk: 'low' | 'medium' | 'high';
  dryRunSummary?: string[];
  reversible: boolean;
  blastEstimate?: string;
}

type Remediation = {
  id: string;
  actionName: string;
  status: 'pending' | 'executing' | 'executed' | 'failed' | 'rejected' | 'undoing' | 'undone';
  dryRunResult: { success: boolean; message: string };
  executeResult?: { success: boolean; message: string };
  approvalReason?: string;
  rejectionReason?: string;
};

export function ApprovalCard({ data }: { data: ApprovalCardData }) {
  const workspaceId = useWorkspaceId();
  const requestId = data.remediationRequestId ?? data.remediation_request_id;
  const [remediation, setRemediation] = useState<Remediation | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(Boolean(requestId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await opsFetch<{ remediation: Remediation }>(workspaceId, `remediations/${encodeURIComponent(requestId)}`);
      setRemediation(result.remediation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load remediation');
    } finally {
      setLoading(false);
    }
  }, [requestId, workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = async (decision: 'approve' | 'reject') => {
    if (!requestId || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await opsFetch(workspaceId, `remediations/${encodeURIComponent(requestId)}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success(decision === 'approve' ? 'Remediation approved' : 'Remediation rejected');
      setReason('');
      await reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Decision failed';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const status = remediation?.status;
  const summary = remediation?.dryRunResult.message ?? data.dryRunSummary?.join('\n');

  return (
    <div className="sazabi-glass sazabi-scanlines space-y-3 rounded-xl border border-[var(--sazabi-border)] bg-[rgba(70,16,22,0.45)] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[13px] font-semibold text-white">Proposed action</p>
          <p className="mt-0.5 text-[13px] text-white/75">
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px]">{data.action}</code>
            {' on '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[12px]">{data.target}</code>
          </p>
        </div>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            data.risk === 'high' && 'bg-[var(--sazabi-crimson)]/25 text-[var(--sazabi-crimson)]',
            data.risk === 'medium' && 'bg-[var(--sazabi-warn)]/20 text-[var(--sazabi-warn)]',
            data.risk === 'low' && 'bg-[var(--sazabi-ok)]/20 text-[var(--sazabi-ok)]',
          )}
        >
          {data.risk} risk
        </span>
      </div>

      {data.blastEstimate && (
        <p className="text-[11px] text-white/45">
          Blast estimate: <span className="text-white/70">{data.blastEstimate}</span>
        </p>
      )}
      {summary && <p className="rounded-lg border border-white/10 bg-black/30 p-2.5 font-mono text-[11px] text-[#c8f0d8]">{summary}</p>}
      {loading && <p className="text-[11px] text-white/45">Loading durable request…</p>}
      {!requestId && (
        <p className="text-[11px] text-[var(--sazabi-warn)]">
          No durable remediation request is attached. This card cannot execute actions.
        </p>
      )}
      {status && <p className="text-[11px] uppercase tracking-wide text-white/55">Status: {status}</p>}
      {remediation?.executeResult && <p className="text-[12px] text-white/70">{remediation.executeResult.message}</p>}
      {error && <p className="text-[11px] text-[var(--sazabi-crimson)]">{error}</p>}

      {status === 'pending' && (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            placeholder="Required approval or rejection reason"
            className="min-h-16 w-full rounded-md border border-white/10 bg-black/30 px-2.5 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={submitting || !reason.trim()}
              onClick={() => void decide('approve')}
              className="sazabi-btn-primary rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-40"
            >
              Approve &amp; run
            </button>
            <button
              type="button"
              disabled={submitting || !reason.trim()}
              onClick={() => void decide('reject')}
              className="sazabi-btn-ghost rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-40"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
