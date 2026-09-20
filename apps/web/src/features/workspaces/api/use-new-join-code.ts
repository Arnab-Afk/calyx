import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { workspaceId: Id<'workspaces'> };
type ResponseType = Id<'workspaces'> | null;

export const useNewJoinCode = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => await chatApi.rotateJoinCode(String(values.workspaceId)).then(() => values.workspaceId),
  );
