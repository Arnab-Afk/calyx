'use client';

import { usePathname } from 'next/navigation';

export type WorkspaceSection = 'overview' | 'projects' | 'chat' | 'settings';

export function useWorkspaceSection(): WorkspaceSection {
  const pathname = usePathname() || '';
  if (pathname.includes('/projects')) return 'projects';
  if (pathname.includes('/settings')) return 'settings';
  if (pathname.includes('/channel/') || pathname.includes('/member/') || pathname.includes('/chat')) {
    return 'chat';
  }
  if (pathname.includes('/overview')) return 'overview';
  return 'overview';
}

export function isChatRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.includes('/channel/') || pathname.includes('/member/') || /\/chat\/?$/.test(pathname);
}
