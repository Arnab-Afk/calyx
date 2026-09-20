'use client';

import { Loader } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import { useGetWorkspaces } from '@/features/workspaces/api/use-get-workspaces';
import { useCreateWorkspaceModal } from '@/features/workspaces/store/use-create-workspace-modal';

const HomePageInner = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useCreateWorkspaceModal();
  const { data, isLoading } = useGetWorkspaces();

  const workspaceId = useMemo(() => data?.[0]?._id, [data]);

  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      const repo = searchParams.get('repo');
      toast.success(repo ? `GitHub connected: ${repo}` : 'GitHub repository connected');
    }
  }, [searchParams]);

  useEffect(() => {
    if (isLoading) return;

    if (workspaceId) {
      router.replace(`/workspace/${workspaceId}`);
    } else if (!open) {
      setOpen(true);
    }
  }, [workspaceId, isLoading, open, setOpen, router]);

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
