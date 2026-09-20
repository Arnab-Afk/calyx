import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexWorkspace } from '@/lib/chat-compat';

interface useGetWorkspaceProps {
  id: Id<'workspaces'>;
}

export const useGetWorkspace = ({ id }: useGetWorkspaceProps) => {
  const convexData = useQuery(api.workspaces.getById, isGoChatBackend ? 'skip' : { id });
  const go = useChatResource(`workspace:${id}`, isGoChatBackend, async (signal) =>
    convexWorkspace(await chatApi.workspace(String(id), signal)),
  );
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
