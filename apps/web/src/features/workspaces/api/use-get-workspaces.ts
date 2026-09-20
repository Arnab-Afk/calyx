import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import { useChatWorkspaces } from '@/features/workspaces/api/use-chat-workspaces';
import { isGoChatBackend } from '@/lib/chat-backend';

export const useGetWorkspaces = () => {
  const convexData = useQuery(api.workspaces.get, isGoChatBackend ? 'skip' : {});
  const go = useChatWorkspaces(isGoChatBackend);
  if (isGoChatBackend) {
    return {
      data: go.data.map((workspace) => ({ ...workspace, _id: workspace.id, _creationTime: Date.parse(workspace.createdAt) })),
      isLoading: go.isLoading,
    };
  }
  return { data: convexData, isLoading: convexData === undefined };
};
