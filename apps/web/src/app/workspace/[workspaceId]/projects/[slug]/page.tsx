'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';

import { ProjectDetailPage } from '@/features/dashboard/components/project-console';

function ProjectDetailInner() {
  const params = useParams<{ slug?: string }>();
  const slug = typeof params.slug === 'string' ? decodeURIComponent(params.slug) : '';
  if (!slug) {
    return <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-sm text-white/45">Missing project</div>;
  }
  return <ProjectDetailPage slug={slug} />;
}

export default function WorkspaceProjectDetailRoute() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#0a0a0c] text-sm text-white/45">Loading…</div>}>
      <ProjectDetailInner />
    </Suspense>
  );
}
