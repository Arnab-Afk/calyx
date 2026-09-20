'use client';

import { type PropsWithChildren, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ChatApiError, type ChatUser, chatApi, chatApiUrl } from '@/lib/chat-api';

type Credentials = { email: string; password: string };
type Registration = Credentials & { name: string };

interface ChatAuthContextValue {
  user: ChatUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  login(input: Credentials): Promise<void>;
  register(input: Registration): Promise<void>;
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const ChatAuthContext = createContext<ChatAuthContextValue | null>(null);

export function ChatAuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<ChatUser | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(chatApiUrl));

  const refresh = useCallback(async () => {
    if (!chatApiUrl) return;
    try {
      setUser(await chatApi.me());
    } catch (error) {
      if (!(error instanceof ChatApiError) || error.status !== 401) throw error;
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (!chatApiUrl) return;
    const controller = new AbortController();
    chatApi
      .me(controller.signal)
      .then(setUser)
      .catch((error) => {
        if (error instanceof ChatApiError && error.status === 401) setUser(null);
      })
      .finally(() => setIsLoading(false));
    return () => controller.abort();
  }, []);

  const value = useMemo<ChatAuthContextValue>(
    () => ({
      user,
      isLoading,
      isConfigured: Boolean(chatApiUrl),
      refresh,
      async login(input) {
        const result = await chatApi.login(input);
        setUser(result.user);
      },
      async register(input) {
        const result = await chatApi.register(input);
        setUser(result.user);
      },
      async logout() {
        await chatApi.logout();
        setUser(null);
      },
    }),
    [isLoading, refresh, user],
  );

  return <ChatAuthContext.Provider value={value}>{children}</ChatAuthContext.Provider>;
}

export function useChatAuth(): ChatAuthContextValue {
  const value = useContext(ChatAuthContext);
  if (!value) throw new Error('useChatAuth must be used inside ChatAuthProvider');
  return value;
}
