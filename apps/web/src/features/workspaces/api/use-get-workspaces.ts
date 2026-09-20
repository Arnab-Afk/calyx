import { convexWorkspace } from '@/lib/chat-compat';

import { useChatWorkspaces } from './use-chat-workspaces';

export const useGetWorkspaces = () => {
  const resource = useChatWorkspaces();
  return { data: resource.data.map(convexWorkspace), isLoading: resource.isLoading };
};
