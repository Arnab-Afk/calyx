'use client';

import { ControlCenter } from '@/features/control/components/control-center';

interface PreferencesModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialValue: string;
}

/** Slack-style control center (profile, team, projects, connections). */
export const PreferencesModal = ({ open, setOpen }: PreferencesModalProps) => {
  return <ControlCenter open={open} setOpen={setOpen} initialSection="workspace" />;
};
