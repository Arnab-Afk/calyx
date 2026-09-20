'use client';

import { Loader } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { useOpsProjects } from '@/features/control/api/use-ops';
import {
  markOnboardingDone,
  useLogsOnboarding,
} from '@/features/onboarding/store/use-logs-onboarding';
import { useGetWorkspaceInfo } from '@/features/workspaces/api/use-get-workspace-info';
import { useWorkspaceId } from '@/hooks/use-workspace-id';

/** Workspace root → Overview. Onboarding only when this workspace has zero projects. */
const WorkspaceIdPage = () => {
  const router = useRouter();
  const workspaceId = useWorkspaceId();
  const { open: onboardingOpen, openFor, close } = useLogsOnboarding();
  const promptedRef = useRef<string | null>(null);

  const { data: workspace, isLoading: workspaceLoading } = useGetWorkspaceInfo({ id: workspaceId });
  const { projects, loading: projectsLoading } = useOpsProjects();

  const isProjectShare = workspace?.kind === 'project_share';
  const needsProjectsSetup =
    workspace?.role === 'admin' && !isProjectShare && !projectsLoading && projects.length === 0;
  const hasProjects = !projectsLoading && projects.length > 0;

  useEffect(() => {
    if (workspaceLoading || projectsLoading || !workspace || !workspaceId) return;

    // Already set up — never re-prompt from a stale localStorage pending flag.
    if (hasProjects) {
      markOnboardingDone(String(workspaceId));
      if (onboardingOpen) close({ done: true });
      router.replace(`/workspace/${workspaceId}/overview`);
      return;
    }

    if (needsProjectsSetup) {
      if (promptedRef.current !== String(workspaceId)) {
        promptedRef.current = String(workspaceId);
        if (!onboardingOpen) openFor(String(workspaceId));
      }
      return;
    }

    router.replace(`/workspace/${workspaceId}/overview`);
  }, [
    workspaceLoading,
    projectsLoading,
    workspace,
    workspaceId,
    needsProjectsSetup,
    hasProjects,
    onboardingOpen,
    openFor,
    close,
    router,
  ]);

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#0a0a0c] text-white">
      <Loader className="size-5 animate-spin" />
      <span className="text-sm text-white/50">
        {needsProjectsSetup || onboardingOpen ? 'Let’s connect your first project…' : 'Opening dashboard…'}
      </span>
    </div>
  );
};

export default WorkspaceIdPage;
