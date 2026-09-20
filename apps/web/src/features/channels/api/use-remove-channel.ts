import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { id: Id<'channels'> };
type ResponseType = Id<'channels'> | null;

export const useRemoveChannel = () =>
  useChatMutation<RequestType, ResponseType>(async (values) => await chatApi.deleteChannel(String(values.id)).then(() => values.id));
