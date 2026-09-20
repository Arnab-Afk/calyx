import { usePaginatedQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexMessage } from '@/lib/chat-compat';

const BATCH_SIZE = 20;

interface UseGetMessagesProps {
  channelId?: Id<'channels'>;
  conversationId?: Id<'conversations'>;
  parentMessageId?: Id<'messages'>;
}

export type GetMessagesReturnType = (typeof api.messages.get._returnType)['page'];

export const useGetMessages = ({ channelId, conversationId, parentMessageId }: UseGetMessagesProps) => {
  const convex = usePaginatedQuery(api.messages.get, isGoChatBackend ? 'skip' : { channelId, conversationId, parentMessageId }, {
    initialNumItems: BATCH_SIZE,
  });
  const key = `messages:${channelId ?? ''}:${conversationId ?? ''}:${parentMessageId ?? ''}`;
  const go = useChatResource<GetMessagesReturnType>(key, isGoChatBackend, async (signal) => {
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
    return response.messages.map(convexMessage) as unknown as GetMessagesReturnType;
  });

  if (isGoChatBackend) {
    return {
      results: go.data ?? [],
      status: go.isLoading ? ('LoadingFirstPage' as const) : ('Exhausted' as const),
      loadMore: () => undefined,
    };
  }
  return {
    results: convex.results,
    status: convex.status,
    loadMore: () => convex.loadMore(BATCH_SIZE),
  };
};
