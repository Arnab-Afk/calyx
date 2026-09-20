'use client';

import { Loader } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type PropsWithChildren, useEffect } from 'react';

import { useChatAuth } from '@/components/chat-auth-provider';
import { isGoChatBackend } from '@/lib/chat-backend';

export function ChatRouteGate({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useChatAuth();
  const isAuthPage = pathname === '/auth';

  useEffect(() => {
    if (!isGoChatBackend || isLoading) return;
    if (!user && !isAuthPage) router.replace('/auth');
    if (user && isAuthPage) router.replace('/');
  }, [isAuthPage, isLoading, router, user]);

  if (!isGoChatBackend) return children;
  if (isLoading || (!user && !isAuthPage) || (user && isAuthPage)) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#101014]">
        <Loader className="size-5 animate-spin text-white" />
      </div>
    );
  }
  return children;
}
