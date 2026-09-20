'use client';

import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexMember } from '@/lib/chat-compat';

interface UseGetMemberProps {
  id: Id<'members'>;
}

export const useGetMember = ({ id }: UseGetMemberProps) => {
  const resource = useChatResource(`member:${id}`, true, async (signal) => convexMember(await chatApi.member(String(id), signal)));
  return { data: resource.data, isLoading: resource.isLoading };
};
