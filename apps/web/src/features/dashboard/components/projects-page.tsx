'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

import { ProjectsPanel } from '@/features/control/components/projects-panel';

function ProjectsPageInner() {
  const searchParams = useSearchParams();
  const project = searchParams.get('project');

  useEffect(() => {
    if (!project) return;
    // ProjectsPanel selects via internal state; scroll into view after mount.
    const el = document.getElementById('projects-panel-root');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [project]);

  return (
    <div id="projects-panel-root" className="h-full overflow-y-auto bg-[#0a0a0c]">
      <ProjectsPanel initialSlug={project} />
    </div>
  );
}

export function ProjectsPage() {
  return (
    <Suspense
      fallback={<div className="flex h-full items-center justify-center bg-[#0a0a0c] text-sm text-white/45">Loading…</div>}
    >
      <ProjectsPageInner />
    </Suspense>
  );
}
