'use client';

import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexMember } from '@/lib/chat-compat';

interface UseCurrentMemberProps {
  workspaceId: Id<'workspaces'>;
}

export const useCurrentMember = ({ workspaceId }: UseCurrentMemberProps) => {
  const convexData = useQuery(api.members.current, isGoChatBackend ? 'skip' : { workspaceId });
  const go = useChatResource(`current-member:${workspaceId}`, isGoChatBackend, async (signal) =>
    convexMember(await chatApi.currentMember(String(workspaceId), signal)),
  );
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
