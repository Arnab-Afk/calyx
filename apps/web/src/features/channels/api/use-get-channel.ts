import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexChannel } from '@/lib/chat-compat';

interface UseGetChannelProps {
  id: Id<'channels'>;
}

export const useGetChannel = ({ id }: UseGetChannelProps) => {
  const resource = useChatResource(`channel:${id}`, true, async (signal) => convexChannel(await chatApi.channel(String(id), signal)));
  return { data: resource.data, isLoading: resource.isLoading };
};
