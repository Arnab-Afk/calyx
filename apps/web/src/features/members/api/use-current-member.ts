'use client';

import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexMember } from '@/lib/chat-compat';

interface UseCurrentMemberProps {
  workspaceId: Id<'workspaces'>;
}

export const useCurrentMember = ({ workspaceId }: UseCurrentMemberProps) => {
  const resource = useChatResource(`current-member:${workspaceId}`, true, async (signal) =>
    convexMember(await chatApi.currentMember(String(workspaceId), signal)),
  );
  return { data: resource.data, isLoading: resource.isLoading };
};
