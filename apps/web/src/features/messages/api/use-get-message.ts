import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexMessage } from '@/lib/chat-compat';

interface UseGetMessageProps {
  id: Id<'messages'>;
}

export const useGetMessage = ({ id }: UseGetMessageProps) => {
  const resource = useChatResource(`message:${id}`, true, async (signal) => convexMessage(await chatApi.message(String(id), signal)));
  return { data: resource.data, isLoading: resource.isLoading };
};
