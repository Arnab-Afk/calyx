'use client';

import { useState, useCallback } from 'react';
import type { CalyxData } from './calyx-message';

interface AskResult {
  answer: string;
  chartType: string | null;
  chartData: unknown;
  toolCallsMade: { toolName: string; summary?: string }[];
}

export function useCalyxAsk(workspaceId: string) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (message: string): Promise<AskResult | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/calyx/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, workspaceId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      return await res.json();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const buildCalyxData = useCallback((query: string, result: AskResult): CalyxData => ({
    query,
    answer: result.answer,
    chartType: result.chartType ?? undefined,
    chartData: result.chartData ? JSON.stringify(result.chartData) : undefined,
    toolNames: result.toolCallsMade.map((c) => c.toolName),
    tenantId: workspaceId,
  }), [workspaceId]);

  return { ask, buildCalyxData, isLoading, error };
}
