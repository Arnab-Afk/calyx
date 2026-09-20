import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { name: string };
type ResponseType = Id<'workspaces'> | null;

export const useCreateWorkspace = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => (await chatApi.createWorkspace(values.name)).workspace.id as Id<'workspaces'>,
  );
