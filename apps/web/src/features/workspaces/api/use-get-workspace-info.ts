import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';

interface UseGetWorkspaceInfoProps {
  id: Id<'workspaces'>;
}

export const useGetWorkspaceInfo = ({ id }: UseGetWorkspaceInfoProps) => {
  const resource = useChatResource(`workspace-info:${id}`, true, (signal) => chatApi.workspaceInfo(String(id), signal));
  return { data: resource.data, isLoading: resource.isLoading };
};
