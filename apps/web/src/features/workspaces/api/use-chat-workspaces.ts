'use client';

import { useCallback, useEffect, useState } from 'react';

import { type ChatWorkspace, chatApi, chatApiUrl } from '@/lib/chat-api';

export function useChatWorkspaces(enabled = true) {
  const [data, setData] = useState<ChatWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(chatApiUrl));
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!chatApiUrl || !enabled) return;
      try {
        setError(null);
        const response = await chatApi.workspaces(signal);
        setData(response.workspaces);
      } catch (value) {
        if ((value as { name?: string }).name !== 'AbortError') {
          setError(value instanceof Error ? value : new Error(String(value)));
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (enabled) void reload(controller.signal);
    else setIsLoading(false);
    return () => controller.abort();
  }, [enabled, reload]);

  const create = useCallback(async (name: string) => {
    const result = await chatApi.createWorkspace(name);
    setData((current) => [result.workspace, ...current]);
    return result.workspace;
  }, []);

  const remove = useCallback(async (id: string) => {
    await chatApi.deleteWorkspace(id);
    setData((current) => current.filter((workspace) => workspace.id !== id));
  }, []);

  const rename = useCallback(async (id: string, name: string) => {
    await chatApi.updateWorkspace(id, name);
    setData((current) => current.map((workspace) => (workspace.id === id ? { ...workspace, name } : workspace)));
  }, []);

  return { data, isLoading, error, reload, create, remove, rename };
}
