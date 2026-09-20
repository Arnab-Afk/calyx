import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';

interface useGetWorkspaceInfoProps {
  id: Id<'workspaces'>;
}

export const useGetWorkspaceInfo = ({ id }: useGetWorkspaceInfoProps) => {
  const convexData = useQuery(api.workspaces.getInfoById, isGoChatBackend ? 'skip' : { id });
  const go = useChatResource(`workspace-info:${id}`, isGoChatBackend, (signal) => chatApi.workspaceInfo(String(id), signal));
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
