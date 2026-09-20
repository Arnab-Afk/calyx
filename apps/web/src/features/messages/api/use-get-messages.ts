import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexMessage } from '@/lib/chat-compat';

const BATCH_SIZE = 100;

interface UseGetMessagesProps {
  channelId?: Id<'channels'>;
  conversationId?: Id<'conversations'>;
  parentMessageId?: Id<'messages'>;
}

export type GetMessagesReturnType = ReturnType<typeof convexMessage>[];
type PaginationStatus = 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';

export const useGetMessages = ({
  channelId,
  conversationId,
  parentMessageId,
}: UseGetMessagesProps): {
  results: GetMessagesReturnType;
  status: PaginationStatus;
  loadMore: () => void;
} => {
  const key = `messages:${channelId ?? ''}:${conversationId ?? ''}:${parentMessageId ?? ''}`;
  const resource = useChatResource<GetMessagesReturnType>(key, true, async (signal) => {
    let resolvedChannel = channelId ? String(channelId) : undefined;
    let resolvedConversation = conversationId ? String(conversationId) : undefined;
    if (!resolvedChannel && !resolvedConversation && parentMessageId) {
      const parent = await chatApi.message(String(parentMessageId), signal);
      resolvedChannel = parent.channelId;
      resolvedConversation = parent.conversationId;
    }
    const options = { parentMessageId: parentMessageId ? String(parentMessageId) : undefined, limit: BATCH_SIZE, signal };
    const response = resolvedChannel
      ? await chatApi.channelMessages(resolvedChannel, options)
      : resolvedConversation
        ? await chatApi.conversationMessages(resolvedConversation, options)
        : { messages: [] };
    return response.messages.map(convexMessage);
  });

  return {
    results: resource.data ?? [],
    status: resource.isLoading ? 'LoadingFirstPage' : 'Exhausted',
    loadMore: () => undefined,
  };
};
