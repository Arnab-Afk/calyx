'use client';

import { Loader, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useGetWorkspace } from '@/features/workspaces/api/use-get-workspace';
import { useGetWorkspaces } from '@/features/workspaces/api/use-get-workspaces';
import { useChatWorkspaces } from '@/features/workspaces/api/use-chat-workspaces';
import { useCreateWorkspaceModal } from '@/features/workspaces/store/use-create-workspace-modal';
import { useWorkspaceId } from '@/hooks/use-workspace-id';

export const WorkspaceSwitcher = () => {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const [_open, setOpen] = useCreateWorkspaceModal();

  const { data: workspaces } = useGetWorkspaces();
  const { data: workspace, isLoading: workspaceLoading } = useGetWorkspace({ id: workspaceId });
  const { data: workspacesRaw } = useChatWorkspaces();

  const filteredWorkspaces = workspaces?.filter((workspace) => workspace?._id !== workspaceId);
  const kindById = new Map(workspacesRaw.map((w) => [w.id, w.kind ?? 'standard']));
  const activeKind = kindById.get(String(workspaceId)) ?? 'standard';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="relative size-9 overflow-hidden bg-[#ABABAB] text-lg font-semibold text-slate-800 hover:bg-[#ABABAB]/80">
          {workspaceLoading ? <Loader className="size-5 shrink-0 animate-spin" /> : workspace?.name.charAt(0).toUpperCase()}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="start" className="w-64">
        <DropdownMenuItem
          onClick={() => router.push(`/workspace/${workspaceId}`)}
          className="cursor-pointer flex-col items-start justify-start capitalize"
        >
          {workspace?.name}
          <span className="text-xs text-muted-foreground">
            {activeKind === 'project_share' ? 'Shared project' : 'Active workspace'}
          </span>
        </DropdownMenuItem>

        {filteredWorkspaces?.map((item) => {
          const kind = kindById.get(String(item._id)) ?? 'standard';
          return (
            <DropdownMenuItem
              key={item._id}
              className="cursor-pointer overflow-hidden capitalize"
              onClick={() => router.push(`/workspace/${item._id}`)}
            >
              <div className="relative mr-2 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#616061] text-xl font-semibold text-white">
                {item.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate">{item.name}</p>
                {kind === 'project_share' && (
                  <p className="text-[10px] normal-case text-muted-foreground">Shared project</p>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={() => setOpen(true)}>
          <div className="relative mr-2 flex size-9 items-center justify-center overflow-hidden rounded-md bg-[#F2F2F2] text-xl font-semibold text-slate-800">
            <Plus />
          </div>
          Create a new workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
