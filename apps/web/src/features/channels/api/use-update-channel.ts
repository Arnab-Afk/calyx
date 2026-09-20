import type { Id } from '@/../convex/_generated/dataModel';
import { useChatMutation } from '@/hooks/use-chat-mutation';
import { chatApi } from '@/lib/chat-api';

type RequestType = { name: string; id: Id<'channels'> };
type ResponseType = Id<'channels'> | null;

export const useUpdateChannel = () =>
  useChatMutation<RequestType, ResponseType>(
    async (values) => (await chatApi.updateChannel(String(values.id), values.name)).id as Id<'channels'>,
  );
