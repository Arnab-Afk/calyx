'use client';

import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexMember } from '@/lib/chat-compat';

interface UseGetMembersProps {
  workspaceId: Id<'workspaces'>;
}

export const useGetMembers = ({ workspaceId }: UseGetMembersProps) => {
  const resource = useChatResource(`members:${workspaceId}`, true, async (signal) => {
    const response = await chatApi.members(String(workspaceId), signal);
    return response.members.map(convexMember);
  });
  return { data: resource.data, isLoading: resource.isLoading };
};
