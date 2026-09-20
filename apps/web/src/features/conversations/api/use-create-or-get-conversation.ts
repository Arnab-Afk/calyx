import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = {
  workspaceId: Id<'workspaces'>;
  memberId: Id<'members'>;
};
type ResponseType = Id<'conversations'> | null;

export const useCreateOrGetConversation = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) =>
      (await chatApi.createOrGetConversation(String(values.workspaceId), String(values.memberId))).id as Id<'conversations'>,
  );
