import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  body: string;
  image?: Id<'_storage'>;

  workspaceId: Id<'workspaces'>;
  channelId?: Id<'channels'>;
  conversationId?: Id<'conversations'>;
  parentMessageId?: Id<'messages'>;
  calyxData?: {
    query: string;
    answer: string;
    chartType?: string;
    chartData?: string;
    toolNames: string[];
    tenantId: string;
  };
};
type ResponseType = Id<'messages'> | null;

export const useCreateMessage = () =>
  useChatMutation<RequestType, ResponseType>(async (values) => {
    if (values.calyxData) throw new Error('Trusted Calyx messages must use the server investigation endpoint');
    const input = {
      body: values.body,
      imageId: values.image ? String(values.image) : undefined,
      parentMessageId: values.parentMessageId ? String(values.parentMessageId) : undefined,
    };
    const message = values.channelId
      ? await chatApi.createChannelMessage(String(values.channelId), input)
      : values.conversationId
        ? await chatApi.createConversationMessage(String(values.conversationId), input)
        : null;
    if (!message) throw new Error('A channel or conversation is required');
    return message.id as Id<'messages'>;
  });
