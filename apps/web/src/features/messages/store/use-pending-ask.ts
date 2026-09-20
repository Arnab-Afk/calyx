import { atom, useAtom } from 'jotai';

const pendingAskAtom = atom<string | null>(null);

export const usePendingAsk = () => useAtom(pendingAskAtom);
