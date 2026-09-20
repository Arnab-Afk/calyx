'use client';

import { useQuery } from 'convex/react';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';
import { useChatResource } from '@/hooks/use-chat-resource';
import { chatApi } from '@/lib/chat-api';
import { isGoChatBackend } from '@/lib/chat-backend';
import { convexMember } from '@/lib/chat-compat';

interface UseGetMemberProps {
  id: Id<'members'>;
}

export const useGetMember = ({ id }: UseGetMemberProps) => {
  const convexData = useQuery(api.members.getById, isGoChatBackend ? 'skip' : { id });
  const go = useChatResource(`member:${id}`, isGoChatBackend, async (signal) => convexMember(await chatApi.member(String(id), signal)));
  return isGoChatBackend ? { data: go.data, isLoading: go.isLoading } : { data: convexData, isLoading: convexData === undefined };
};
