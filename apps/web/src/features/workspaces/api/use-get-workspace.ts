import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { convexWorkspace } from '@/lib/chat-compat';

interface UseGetWorkspaceProps {
  id: Id<'workspaces'>;
}

export const useGetWorkspace = ({ id }: UseGetWorkspaceProps) => {
  const resource = useChatResource(`workspace:${id}`, true, async (signal) => convexWorkspace(await chatApi.workspace(String(id), signal)));
  return { data: resource.data, isLoading: resource.isLoading };
};
