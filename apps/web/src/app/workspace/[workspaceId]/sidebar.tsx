'use client';

import { FolderKanban, Home, MessageSquare, Settings2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { UserButton } from '@/features/auth/components/user-button';
import { ControlCenter } from '@/features/control/components/control-center';
import { useGetChannels } from '@/features/channels/api/use-get-channels';
import { useWorkspaceSection } from '@/hooks/use-workspace-section';
import { useWorkspaceId } from '@/hooks/use-workspace-id';

import { SidebarButton } from './sidebar-button';
import { WorkspaceSwitcher } from './workspace-switcher';

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const section = useWorkspaceSection();
  const [controlOpen, setControlOpen] = useState(false);
  const { data: channels } = useGetChannels({ workspaceId });
  const firstChannel = useMemo(() => channels?.[0]?._id, [channels]);

  const goChat = () => {
    if (firstChannel) router.push(`/workspace/${workspaceId}/channel/${firstChannel}`);
    else router.push(`/workspace/${workspaceId}/chat`);
  };

  return (
    <aside className="flex h-full w-[70px] flex-col items-center gap-y-4 border-r border-white/10 bg-[#0a0a0c] pb-[4px] pt-[9px]">
      <ControlCenter open={controlOpen} setOpen={setControlOpen} />
      <WorkspaceSwitcher />

      <SidebarButton
        icon={Home}
        label="Overview"
        isActive={section === 'overview'}
        onClick={() => router.push(`/workspace/${workspaceId}/overview`)}
      />
      <SidebarButton
        icon={FolderKanban}
        label="Projects"
        isActive={section === 'projects'}
        onClick={() => router.push(`/workspace/${workspaceId}/projects`)}
      />
      <SidebarButton
        icon={MessageSquare}
        label="Chat"
        isActive={section === 'chat' || pathname.includes('/channel/') || pathname.includes('/member/')}
        onClick={goChat}
      />
      <SidebarButton
        icon={Settings2}
        label="Settings"
        isActive={section === 'settings'}
        onClick={() => router.push(`/workspace/${workspaceId}/settings`)}
      />

      <div className="mt-auto flex flex-col items-center justify-center gap-y-1">
        <UserButton onOpenProfile={() => setControlOpen(true)} />
      </div>
    </aside>
  );
};
