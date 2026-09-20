import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  id: Id<'messages'>;
};
type ResponseType = Id<'messages'> | null;

export const useRemoveMessage = () =>
  useChatMutation<RequestType, ResponseType>(async (values) => await chatApi.deleteMessage(String(values.id)).then(() => values.id));
