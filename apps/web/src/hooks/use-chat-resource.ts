'use client';

import { useEffect, useRef, useState } from 'react';

export function useChatResource<T>(key: string, enabled: boolean, loader: (signal: AbortSignal) => Promise<T>) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isValidating, setIsValidating] = useState(false);
  const [revision, setRevision] = useState(0);
  const hasDataRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const invalidate = () => setRevision((value) => value + 1);
    window.addEventListener('calyx:chat-mutated', invalidate);
    return () => window.removeEventListener('calyx:chat-mutated', invalidate);
  }, [enabled]);

  useEffect(() => {
    hasDataRef.current = false;
    setData(undefined);
  }, [key]);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setIsValidating(false);
      return;
    }
    const controller = new AbortController();
    const soft = hasDataRef.current;
    if (soft) setIsValidating(true);
    else setIsLoading(true);
    setError(null);
    loaderRef
      .current(controller.signal)
      .then((value) => {
        hasDataRef.current = true;
        setData(value);
      })
      .catch((value) => {
        if ((value as { name?: string }).name !== 'AbortError') {
          setError(value instanceof Error ? value : new Error(String(value)));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsValidating(false);
        }
      });
    return () => controller.abort();
  }, [enabled, key, revision]);

  return { data, error, isLoading, isValidating, setData };
}
