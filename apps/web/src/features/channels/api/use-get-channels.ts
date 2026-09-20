import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexChannel } from '@/lib/chat-compat';

interface UseGetChannelsProps {
  workspaceId: Id<'workspaces'>;
}

export const useGetChannels = ({ workspaceId }: UseGetChannelsProps) => {
  const convexData = useQuery(api.channels.get, isGoChatBackend ? 'skip' : { workspaceId });
  const go = useChatResource(`channels:${workspaceId}`, isGoChatBackend, async (signal) => {
    const result = await chatApi.channels(String(workspaceId), signal);
    return result.channels.map(convexChannel);
  });
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
