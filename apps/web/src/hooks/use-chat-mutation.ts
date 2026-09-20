'use client';

import { useCallback, useRef, useState } from 'react';

type Options<T> = {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
  throwError?: boolean;
};

export function useChatMutation<TInput, TOutput>(handler: (input: TInput) => Promise<TOutput>) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const [data, setData] = useState<TOutput | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const mutate = useCallback(async (input: TInput, options?: Options<TOutput>) => {
    setData(null);
    setError(null);
    setIsPending(true);
    setIsSuccess(false);
    try {
      const response = await handlerRef.current(input);
      setData(response);
      setIsSuccess(true);
      options?.onSuccess?.(response);
      return response;
    } catch (value) {
      const nextError = value instanceof Error ? value : new Error(String(value));
      setError(nextError);
      options?.onError?.(nextError);
      if (options?.throwError) throw nextError;
    } finally {
      setIsPending(false);
      options?.onSettled?.();
    }
  }, []);

  return { mutate, data, error, isPending, isError: error !== null, isSuccess, isSettled: !isPending };
}
