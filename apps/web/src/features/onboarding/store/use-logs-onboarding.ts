'use client';

import { atom, useAtom } from 'jotai';

type OnboardingState = {
  open: boolean;
  workspaceId: string | null;
};

const logsOnboardingAtom = atom<OnboardingState>({ open: false, workspaceId: null });

const pendingKey = (workspaceId: string) => `calyx:onboarding:pending:${workspaceId}`;
const doneKey = (workspaceId: string) => `calyx:onboarding:done:${workspaceId}`;

export function markOnboardingPending(workspaceId: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(pendingKey(workspaceId), '1');
  localStorage.removeItem(doneKey(workspaceId));
}

export function markOnboardingDone(workspaceId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(pendingKey(workspaceId));
  localStorage.setItem(doneKey(workspaceId), '1');
}

/** Pending only matters when the workspace still has zero projects. */
export function isOnboardingPending(workspaceId: string) {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem(doneKey(workspaceId))) return false;
  return localStorage.getItem(pendingKey(workspaceId)) === '1';
}

export function isOnboardingDone(workspaceId: string) {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(doneKey(workspaceId)) === '1';
}

export const useLogsOnboarding = () => {
  const [state, setState] = useAtom(logsOnboardingAtom);

  const openFor = (workspaceId: string) => {
    markOnboardingPending(workspaceId);
    setState({ open: true, workspaceId });
  };

  const close = (opts?: { done?: boolean }) => {
    if (state.workspaceId && opts?.done) markOnboardingDone(state.workspaceId);
    setState({ open: false, workspaceId: state.workspaceId });
  };

  return { ...state, openFor, close, setState };
};
