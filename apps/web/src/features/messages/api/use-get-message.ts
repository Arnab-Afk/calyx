import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexMessage } from '@/lib/chat-compat';

interface UseGetMessageProps {
  id: Id<'messages'>;
}

export const useGetMessage = ({ id }: UseGetMessageProps) => {
  const convexData = useQuery(api.messages.getById, isGoChatBackend ? 'skip' : { id });
  const go = useChatResource(`message:${id}`, isGoChatBackend, async (signal) => convexMessage(await chatApi.message(String(id), signal)));
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
