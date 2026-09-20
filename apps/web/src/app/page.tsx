'use client';

import { Loader } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { useChatAuth } from '@/components/chat-auth-provider';
import { useChatWorkspaces } from '@/features/workspaces/api/use-chat-workspaces';
import { useCreateWorkspaceModal } from '@/features/workspaces/store/use-create-workspace-modal';
import { convexWorkspace } from '@/lib/chat-compat';

const HomePageInner = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useCreateWorkspaceModal();
  const { user, isLoading: authLoading } = useChatAuth();
  const { data, isLoading, error } = useChatWorkspaces(Boolean(user));

  const workspaces = useMemo(() => data.map(convexWorkspace), [data]);
  const workspaceId = workspaces[0]?._id;

  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      const repo = searchParams.get('repo');
      toast.success(repo ? `GitHub connected: ${repo}` : 'GitHub repository connected');
    }
  }, [searchParams]);

  useEffect(() => {
    if (authLoading || isLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    if (error) {
      toast.error(error.message || 'Could not load workspaces');
      return;
    }
    if (workspaceId) {
      router.replace(`/workspace/${workspaceId}`);
    } else if (!open) {
      setOpen(true);
    }
  }, [workspaceId, isLoading, authLoading, user, error, open, setOpen, router]);

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#101014]/95 text-white">
      <Loader className="size-5 animate-spin" />
    </div>
  );
};

const HomePage = () => (
  <Suspense
    fallback={
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 bg-[#101014]/95 text-white">
        <Loader className="size-5 animate-spin" />
      </div>
    }
  >
    <HomePageInner />
  </Suspense>
);

export default HomePage;
