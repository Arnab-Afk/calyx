import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  id: Id<'members'>;
};
type ResponseType = Id<'members'> | null;

export const useRemoveMember = () =>
  useChatMutation<RequestType, ResponseType>(async (values) => await chatApi.deleteMember(String(values.id)).then(() => values.id));
