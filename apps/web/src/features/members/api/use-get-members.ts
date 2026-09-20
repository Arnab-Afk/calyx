'use client';

import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexMember } from '@/lib/chat-compat';

interface UseGetMembersProps {
  workspaceId: Id<'workspaces'>;
}

export const useGetMembers = ({ workspaceId }: UseGetMembersProps) => {
  const convexData = useQuery(api.members.get, isGoChatBackend ? 'skip' : { workspaceId });
  const go = useChatResource(`members:${workspaceId}`, isGoChatBackend, async (signal) => {
    const result = await chatApi.members(String(workspaceId), signal);
    return result.members.map(convexMember);
  });
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
