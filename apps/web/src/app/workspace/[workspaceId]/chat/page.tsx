'use client';

import { Loader, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { useGetChannels } from '@/features/channels/api/use-get-channels';
import { useCreateChannelModal } from '@/features/channels/store/use-create-channel-modal';
import { useOpsProjects } from '@/features/control/api/use-ops';
import {
  markOnboardingDone,
  useLogsOnboarding,
} from '@/features/onboarding/store/use-logs-onboarding';
import { useGetWorkspaceInfo } from '@/features/workspaces/api/use-get-workspace-info';
import { useWorkspaceId } from '@/hooks/use-workspace-id';

/** Chat entry: onboarding only when this workspace has zero projects. */
const ChatIndexPage = () => {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const [open, setOpen] = useCreateChannelModal();
  const { open: onboardingOpen, openFor, close } = useLogsOnboarding();
  const promptedRef = useRef<string | null>(null);

  const { data: workspace, isLoading: workspaceLoading } = useGetWorkspaceInfo({ id: workspaceId });
  const { data: channels, isLoading: channelsLoading } = useGetChannels({ workspaceId });
  const { projects, loading: projectsLoading } = useOpsProjects();

  const channelId = useMemo(() => channels?.[0]?._id, [channels]);
  const isProjectShare = workspace?.kind === 'project_share';
  const needsProjectsSetup =
    workspace?.role === 'admin' && !isProjectShare && !projectsLoading && projects.length === 0;
  const hasProjects = !projectsLoading && projects.length > 0;

  useEffect(() => {
    if (workspaceLoading || channelsLoading || projectsLoading || !workspace || !workspaceId) return;

    if (hasProjects) {
      markOnboardingDone(String(workspaceId));
      if (onboardingOpen) close({ done: true });
    }

    if (needsProjectsSetup) {
      if (promptedRef.current !== String(workspaceId)) {
        promptedRef.current = String(workspaceId);
        if (!onboardingOpen) openFor(String(workspaceId));
      }
      return;
    }

    if (channelId) router.replace(`/workspace/${workspaceId}/channel/${channelId}`);
    else if (!open && !onboardingOpen && workspace.role === 'admin' && !isProjectShare) setOpen(true);
  }, [
    channelId,
    workspaceLoading,
    channelsLoading,
    projectsLoading,
    workspace,
    open,
    setOpen,
    router,
    workspaceId,
    onboardingOpen,
    openFor,
    close,
    needsProjectsSetup,
    hasProjects,
    isProjectShare,
  ]);

  if (workspaceLoading || channelsLoading || (workspace?.role === 'admin' && projectsLoading)) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#101014]/95 text-white">
        <Loader className="size-5 animate-spin" />
      </div>
    );
  }

  if (!workspaceId || !workspace) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#101014]/95 text-white">
        <TriangleAlert className="size-5" />
        <span className="text-sm">Workspace not found.</span>
      </div>
    );
  }

  if (onboardingOpen || needsProjectsSetup) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#101014]/95 text-white">
        <Loader className="size-5 animate-spin" />
        <span className="text-sm text-white/50">Let’s connect your first project…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#101014]/95 text-white">
      <TriangleAlert className="size-5" />
      <span className="text-sm">No channels yet — create one from the sidebar.</span>
    </div>
  );
};

export default ChatIndexPage;
