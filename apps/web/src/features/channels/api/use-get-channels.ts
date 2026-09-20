import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexChannel } from '@/lib/chat-compat';

interface UseGetChannelsProps {
  workspaceId: Id<'workspaces'>;
}

export const useGetChannels = ({ workspaceId }: UseGetChannelsProps) => {
  const resource = useChatResource(`channels:${workspaceId}`, true, async (signal) => {
    const response = await chatApi.channels(String(workspaceId), signal);
    return response.channels.map(convexChannel);
  });
  return { data: resource.data, isLoading: resource.isLoading };
};
