'use client';

import { useEffect, useState } from 'react';

import { CreateChannelModal } from '@/features/channels/components/create-channel-modal';
import { LogsOnboardingModal } from '@/features/onboarding/components/logs-onboarding-modal';
import { CreateWorkspaceModal } from '@/features/workspaces/components/create-workspace-modal';

export const ModalProvider = () => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) return;

  return (
    <>
      <CreateChannelModal />
      <CreateWorkspaceModal />
      <LogsOnboardingModal />
    </>
  );
};
