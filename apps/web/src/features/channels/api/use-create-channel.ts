import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { name: string; workspaceId: Id<'workspaces'> };
type ResponseType = Id<'channels'> | null;

export const useCreateChannel = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => (await chatApi.createChannel(String(values.workspaceId), values.name)).id as Id<'channels'>,
  );
