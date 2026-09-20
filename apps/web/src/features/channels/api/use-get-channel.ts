import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexChannel } from '@/lib/chat-compat';

interface UseGetChannelProps {
  id: Id<'channels'>;
}

export const useGetChannel = ({ id }: UseGetChannelProps) => {
  const convexData = useQuery(api.channels.getById, isGoChatBackend ? 'skip' : { id });
  const go = useChatResource(`channel:${id}`, isGoChatBackend, async (signal) => convexChannel(await chatApi.channel(String(id), signal)));
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
