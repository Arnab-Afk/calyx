import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  body: string;
  id: Id<'messages'>;
};
type ResponseType = Id<'messages'> | null;

export const useUpdateMessage = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => (await chatApi.updateMessage(String(values.id), values.body)).id as Id<'messages'>,
  );
