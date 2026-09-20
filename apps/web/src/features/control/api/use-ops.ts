'use client';

import { useCallback, useEffect, useState } from 'react';

import { useWorkspaceId } from '@/hooks/use-workspace-id';

export type OpsProject = {
  id: string;
  name?: string;
  slug: string;
  environment?: string;
  tenantId?: string;
};

export type OpsSource = {
  id: string;
  name: string;
  role: string;
  service: string;
  provider: string;
  lastEventAt?: string | null;
  createdAt?: string;
  status?: string;
  drainUrl?: string;
};

export type OpsGithub = {
  repo: string;
  connectedAt: string;
  installationId?: string | null;
} | null;

export type OpsProjectDetail = {
  project: OpsProject;
  sources: OpsSource[];
  github: OpsGithub;
  slack: { channelId: string; channelName?: string; teamId?: string; connectedAt: string } | null;
};

export type SourceTokenResult = {
  source: OpsSource;
  token?: string;
  intakeUrl?: string;
  curlExample?: string;
  note?: string;
};

export async function opsFetch<T>(workspaceId: string, path: string, init?: RequestInit): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`/api/calyx/ops/${path.replace(/^\//, '')}${separator}workspaceId=${encodeURIComponent(workspaceId)}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error || `Ops API ${res.status}`) as Error & {
      status?: number;
      data?: unknown;
    };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export function useOpsProjects() {
  const workspaceId = useWorkspaceId();
  const [projects, setProjects] = useState<OpsProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await opsFetch<{ projects?: OpsProject[] } | OpsProject[]>(workspaceId, 'projects');
      const list = Array.isArray(data) ? data : (data.projects ?? []);
      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (slug: string, environment = 'production') => {
      await opsFetch(workspaceId, 'projects', {
        method: 'POST',
        body: JSON.stringify({ name: slug, slug, environment }),
      });
      await reload();
    },
    [reload, workspaceId],
  );

  return { projects, loading, error, reload, create };
}

export function useOpsProjectDetail(projectSlug: string | null) {
  const workspaceId = useWorkspaceId();
  const [detail, setDetail] = useState<OpsProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectSlug) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await opsFetch<OpsProjectDetail>(workspaceId, `projects/${encodeURIComponent(projectSlug)}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [projectSlug, workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createSource = useCallback(
    async (input: { role: string; service: string; name: string; provider?: string }) => {
      if (!projectSlug) throw new Error('No project selected');
      return opsFetch<SourceTokenResult>(workspaceId, `projects/${encodeURIComponent(projectSlug)}/sources`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    [projectSlug, workspaceId],
  );

  const rotateToken = useCallback(
    async (sourceId: string) => {
      if (!projectSlug) throw new Error('No project selected');
      return opsFetch<SourceTokenResult>(
        workspaceId,
        `projects/${encodeURIComponent(projectSlug)}/sources/${encodeURIComponent(sourceId)}/rotate`,
        { method: 'POST' },
      );
    },
    [projectSlug, workspaceId],
  );

  const connectGithub = useCallback(
    async (input?: { repo?: string; returnTo?: string }) => {
      if (!projectSlug) throw new Error('No project selected');
      const body: { repo?: string; returnTo?: string } = {};
      if (input?.repo) body.repo = input.repo;
      if (input?.returnTo) body.returnTo = input.returnTo;
      return opsFetch<{ installationUrl: string; repo: string | null; expiresInSeconds: number }>(
        workspaceId,
        `projects/${encodeURIComponent(projectSlug)}/github`,
        { method: 'POST', body: JSON.stringify(body) },
      );
    },
    [projectSlug, workspaceId],
  );

  const completeGithub = useCallback(
    async (input: { installationId: string; repo?: string }) => {
      if (!projectSlug) throw new Error('No project selected');
      return opsFetch<{
        connected: boolean;
        repo: string;
        installationId: string;
        repos?: string[];
        error?: string;
      }>(workspaceId, `projects/${encodeURIComponent(projectSlug)}/github/complete`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
    [projectSlug, workspaceId],
  );

  const disconnectGithub = useCallback(async () => {
    if (!projectSlug) throw new Error('No project selected');
    return opsFetch<{ disconnected: boolean; warning?: string }>(
      workspaceId,
      `projects/${encodeURIComponent(projectSlug)}/github`,
      { method: 'DELETE' },
    );
  }, [projectSlug, workspaceId]);

  const connectSlack = useCallback(
    async (input: { channelId: string; channelName?: string }) => {
      if (!projectSlug) throw new Error('No project selected');
      const result = await opsFetch<{
        slack: { channelId: string; channelName?: string; teamId?: string; connectedAt: string };
      }>(workspaceId, `projects/${encodeURIComponent(projectSlug)}/slack`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await reload();
      return result;
    },
    [projectSlug, workspaceId, reload],
  );

  const testSlack = useCallback(async () => {
    if (!projectSlug) throw new Error('No project selected');
    return opsFetch<{ ok: boolean; ts?: string; channel?: string }>(
      workspaceId,
      `projects/${encodeURIComponent(projectSlug)}/slack/test`,
      { method: 'POST', body: '{}' },
    );
  }, [projectSlug, workspaceId]);

  return {
    detail,
    sources: detail?.sources ?? [],
    github: detail?.github ?? null,
    slack: detail?.slack ?? null,
    loading,
    error,
    reload,
    createSource,
    rotateToken,
    connectGithub,
    completeGithub,
    disconnectGithub,
    connectSlack,
    testSlack,
  };
}

export type OpsGithubActivityItem = {
  id: string;
  kind: 'push' | 'merge' | 'deploy' | 'pull_request' | 'release' | 'branch' | 'github';
  title: string;
  summary?: string | null;
  actor?: string | null;
  ref?: string | null;
  sha?: string | null;
  url?: string | null;
  status?: string | null;
  environment?: string | null;
  repo?: string | null;
  at: string;
};

export function useOpsGithubActivity(projectSlug: string | null, opts?: { limit?: number; pollMs?: number; enabled?: boolean }) {
  const workspaceId = useWorkspaceId();
  const [activity, setActivity] = useState<OpsGithubActivityItem[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [counts, setCounts] = useState<{ push: number; merge: number; pull_request: number; deploy: number; total: number }>({
    push: 0,
    merge: 0,
    pull_request: 0,
    deploy: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (sync = false) => {
    if (!projectSlug || opts?.enabled === false) {
      setActivity([]);
      setRepo(null);
      setConnected(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(opts?.limit ?? 80));
      if (sync) params.set('sync', '1');
      const data = await opsFetch<{
        activity?: OpsGithubActivityItem[];
        repo?: string | null;
        connected?: boolean;
        counts?: { push: number; merge: number; pull_request: number; deploy: number; total: number };
      }>(workspaceId, `projects/${encodeURIComponent(projectSlug)}/github/activity?${params.toString()}`);
      setActivity(data.activity ?? []);
      setRepo(data.repo ?? null);
      setConnected(Boolean(data.connected));
      if (data.counts) setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Git activity');
      setActivity([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, projectSlug, opts?.enabled, opts?.limit]);

  useEffect(() => {
    void reload(false);
  }, [reload]);

  useEffect(() => {
    if (!opts?.pollMs || opts?.enabled === false || !projectSlug) return;
    const id = window.setInterval(() => void reload(false), opts.pollMs);
    return () => window.clearInterval(id);
  }, [opts?.pollMs, opts?.enabled, projectSlug, reload]);

  return { activity, repo, connected, counts, loading, error, reload };
}

export type OpsEvent = {
  id: string;
  tenant_id?: string;
  timestamp: string;
  service: string;
  level: string;
  message: string;
  trace_id?: string | null;
  span_id?: string | null;
  attributes?: Record<string, unknown>;
  ingested_at?: string;
};

export function useOpsEvents(opts: {
  service?: string | null;
  level?: string | null;
  limit?: number;
  enabled?: boolean;
  pollMs?: number;
}) {
  const workspaceId = useWorkspaceId();
  const [events, setEvents] = useState<OpsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (opts.enabled === false) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts.service) params.set('service', opts.service);
      if (opts.level) params.set('level', opts.level);
      params.set('limit', String(opts.limit ?? 80));
      const data = await opsFetch<{ events?: OpsEvent[] }>(workspaceId, `events?${params.toString()}`);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, opts.enabled, opts.service, opts.level, opts.limit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!opts.pollMs || opts.enabled === false) return;
    const id = window.setInterval(() => void reload(), opts.pollMs);
    return () => window.clearInterval(id);
  }, [opts.pollMs, opts.enabled, reload]);

  return { events, loading, error, reload };
}

/** @deprecated Prefer useOpsProjectDetail for full project management. */
export function useOpsSources(projectSlug: string | null) {
  const detail = useOpsProjectDetail(projectSlug);
  return {
    sources: detail.sources,
    loading: detail.loading,
    error: detail.error,
    reload: detail.reload,
    createSource: detail.createSource,
    connectGithub: detail.connectGithub,
  };
}
