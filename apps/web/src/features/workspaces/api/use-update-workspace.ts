import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { id: Id<'workspaces'>; name: string };
type ResponseType = Id<'workspaces'> | null;

export const useUpdateWorkspace = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => (await chatApi.updateWorkspace(String(values.id), values.name)).id as Id<'workspaces'>,
  );
