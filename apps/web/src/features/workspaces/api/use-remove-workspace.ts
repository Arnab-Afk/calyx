import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { id: Id<'workspaces'> };
type ResponseType = Id<'workspaces'> | null;

export const useRemoveWorkspace = () =>
  useChatMutation<RequestType, ResponseType>(async (values) => await chatApi.deleteWorkspace(String(values.id)).then(() => values.id));
