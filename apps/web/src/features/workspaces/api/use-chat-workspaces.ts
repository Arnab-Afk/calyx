'use client';

import { useCallback, useEffect, useState } from 'react';

import { type ChatWorkspace, chatApi, chatApiUrl } from '@/lib/chat-api';

export function useChatWorkspaces() {
  const [data, setData] = useState<ChatWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(chatApiUrl));
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!chatApiUrl) return;
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

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
