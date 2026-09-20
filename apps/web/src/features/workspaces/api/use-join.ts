import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { workspaceId: Id<'workspaces'>; joinCode: string };
type ResponseType = Id<'workspaces'> | null;

export const useJoin = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => await chatApi.joinWorkspace(String(values.workspaceId), values.joinCode).then(() => values.workspaceId),
  );
