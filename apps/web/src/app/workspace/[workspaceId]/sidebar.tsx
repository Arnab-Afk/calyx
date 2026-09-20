'use client';

import { Bell, Home, MessagesSquare, MoreHorizontal, Settings2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { UserButton } from '@/features/auth/components/user-button';
import { ControlCenter } from '@/features/control/components/control-center';

import { SidebarButton } from './sidebar-button';
import { WorkspaceSwitcher } from './workspace-switcher';

export const Sidebar = () => {
  const pathname = usePathname();
  const [controlOpen, setControlOpen] = useState(false);

  return (
    <aside className="flex h-full w-[70px] flex-col items-center gap-y-4 border-r border-white/10 bg-[#0a0a0c] pb-[4px] pt-[9px]">
      <ControlCenter open={controlOpen} setOpen={setControlOpen} />
      <WorkspaceSwitcher />

      <SidebarButton icon={Home} label="Home" isActive={pathname.includes('/workspace')} />
      <SidebarButton icon={MessagesSquare} label="DMs" />
      <SidebarButton icon={Bell} label="Activity" />
      <SidebarButton icon={Settings2} label="Settings" isActive={controlOpen} onClick={() => setControlOpen(true)} />
      <SidebarButton icon={MoreHorizontal} label="More" onClick={() => setControlOpen(true)} />

      <div className="mt-auto flex flex-col items-center justify-center gap-y-1">
        <UserButton onOpenProfile={() => setControlOpen(true)} />
      </div>
    </aside>
  );
};
