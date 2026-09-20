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
    throw new Error((data as { error?: string }).error || `Ops API ${res.status}`);
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

export function useOpsSources(projectSlug: string | null) {
  const workspaceId = useWorkspaceId();
  const [sources, setSources] = useState<OpsSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectSlug) {
      setSources([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await opsFetch<{ sources?: OpsSource[] } | OpsSource[]>(
        workspaceId,
        `projects/${encodeURIComponent(projectSlug)}/sources`,
      );
      setSources(Array.isArray(data) ? data : (data.sources ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
      setSources([]);
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
      return opsFetch<{ source: OpsSource; token?: string; intakeUrl?: string }>(
        workspaceId,
        `projects/${encodeURIComponent(projectSlug)}/sources`,
        { method: 'POST', body: JSON.stringify(input) },
      );
    },
    [projectSlug, workspaceId],
  );

  const connectGithub = useCallback(
    async (repo: string) => {
      if (!projectSlug) throw new Error('No project selected');
      return opsFetch<{ webhookUrl?: string; webhookSecret?: string; repo?: string }>(
        workspaceId,
        `projects/${encodeURIComponent(projectSlug)}/github`,
        { method: 'POST', body: JSON.stringify({ repo }) },
      );
    },
    [projectSlug, workspaceId],
  );

  return { sources, loading, error, reload, createSource, connectGithub };
}
