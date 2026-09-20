import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  id: Id<'members'>;
  role: 'admin' | 'member';
};
type ResponseType = Id<'members'> | null;

export const useUpdateMember = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => (await chatApi.updateMember(String(values.id), values.role)).id as Id<'members'>,
  );
