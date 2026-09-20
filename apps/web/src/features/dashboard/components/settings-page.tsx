'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { ControlCenterShell, type ControlSection } from '@/features/control/components/control-center';

const SECTIONS: ControlSection[] = ['start', 'profile', 'workspace', 'members', 'projects', 'connections'];

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section') as ControlSection | null;
  const initial = sectionParam && SECTIONS.includes(sectionParam) ? sectionParam : 'workspace';
  const [section, setSection] = useState<ControlSection>(initial);

  useEffect(() => {
    setSection(initial);
  }, [initial]);

  return (
    <div className="flex h-full flex-col bg-[#0a0a0c] text-white">
      <div className="border-b border-white/10 px-6 py-5">
        <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.2em] text-white/40">Dashboard</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl text-white">Settings</h1>
        <p className="mt-1 text-sm text-white/50">Workspace, members, connections, and profile.</p>
      </div>
      <div className="min-h-0 flex-1 p-4 md:p-6">
        <ControlCenterShell
          section={section}
          setSection={setSection}
          className="h-full min-h-[560px] rounded-xl shadow-2xl"
        />
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#0a0a0c] text-sm text-white/45">Loading…</div>}>
      <SettingsPageInner />
    </Suspense>
  );
}
