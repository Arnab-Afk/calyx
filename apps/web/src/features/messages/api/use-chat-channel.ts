'use client';

import { useCallback, useEffect, useState } from 'react';

import { type ChatMessage, type ChatRealtimeEvent, chatApi, connectChatRealtime } from '@/lib/chat-api';

export function useChatChannel(channelId: string, workspaceId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setError(null);
        const response = await chatApi.channelMessages(channelId, { signal });
        setMessages(response.messages);
      } catch (value) {
        if ((value as { name?: string }).name !== 'AbortError') {
          setError(value instanceof Error ? value : new Error(String(value)));
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [channelId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const onEvent = (event: ChatRealtimeEvent) => {
      if (event.channelId !== channelId) return;
      const message = event.payload as ChatMessage;
      setMessages((current) => {
        if (event.type === 'message.deleted') return current.filter((item) => item.id !== (event.payload as { id: string }).id);
        if (event.type === 'message.updated') return current.map((item) => (item.id === message.id ? message : item));
        if (event.type === 'message.created' && !current.some((item) => item.id === message.id)) return [message, ...current];
        return current;
      });
    };
    const socket = connectChatRealtime(workspaceId, onEvent);
    return () => socket.close();
  }, [channelId, workspaceId]);

  const send = useCallback(
    async (body: string, options?: { parentMessageId?: string; imageId?: string }) => {
      const message = await chatApi.createChannelMessage(channelId, { body, ...options });
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [message, ...current]));
      return message;
    },
    [channelId],
  );

  return { messages, isLoading, error, reload, send };
}
