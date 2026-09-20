import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  value: string;
  messageId: Id<'messages'>;
};
type ResponseType = Id<'reactions'> | null;

export const useToggleReaction = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) =>
      await chatApi
        .toggleReaction(String(values.messageId), values.value)
        .then(() => `${values.messageId}:${values.value}` as Id<'reactions'>),
  );
