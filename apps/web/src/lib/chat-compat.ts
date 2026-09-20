import type { Doc, Id } from '@/../convex/_generated/dataModel';
import { type ChatChannel, type ChatMember, type ChatMessage, type ChatUser, type ChatWorkspace, chatAssetUrl } from '@/lib/chat-api';

export const convexUser = (user: ChatUser): Doc<'users'> => ({
  _id: user.id as Id<'users'>,
  _creationTime: Date.parse(user.createdAt),
  name: user.name,
  email: user.email,
  image: user.image,
});

export const convexWorkspace = (workspace: ChatWorkspace): Doc<'workspaces'> => ({
  _id: workspace.id as Id<'workspaces'>,
  _creationTime: Date.parse(workspace.createdAt),
  name: workspace.name,
  joinCode: workspace.joinCode,
  userId: workspace.ownerId as Id<'users'>,
});

export const convexChannel = (channel: ChatChannel): Doc<'channels'> => ({
  _id: channel.id as Id<'channels'>,
  _creationTime: Date.parse(channel.createdAt),
  name: channel.name,
  workspaceId: channel.workspaceId as Id<'workspaces'>,
});

export const convexMember = (member: ChatMember): Doc<'members'> & { user: Doc<'users'> } => ({
  _id: member.id as Id<'members'>,
  _creationTime: Date.parse(member.createdAt),
  userId: member.userId as Id<'users'>,
  workspaceId: member.workspaceId as Id<'workspaces'>,
  role: member.role,
  user: convexUser(
    member.user ?? {
      id: member.userId,
      email: '',
      name: 'Unknown member',
      createdAt: member.createdAt,
    },
  ),
});

export const convexMessage = (message: ChatMessage) => {
  const member = convexMember(
    message.member ?? {
      id: message.memberId,
      userId: message.memberId,
      workspaceId: message.workspaceId,
      role: 'member',
      createdAt: message.createdAt,
    },
  );
  return {
    _id: message.id as Id<'messages'>,
    _creationTime: Date.parse(message.createdAt),
    body: message.body,
    memberId: message.memberId as Id<'members'>,
    workspaceId: message.workspaceId as Id<'workspaces'>,
    channelId: message.channelId as Id<'channels'> | undefined,
    parentMessageId: message.parentMessageId as Id<'messages'> | undefined,
    conversationId: message.conversationId as Id<'conversations'> | undefined,
    updatedAt: message.updatedAt ? Date.parse(message.updatedAt) : undefined,
    image: chatAssetUrl(message.imageUrl),
    calyxData: message.calyxData ? { ...message.calyxData, tenantId: message.workspaceId } : undefined,
    member,
    user: member.user,
    reactions: (message.reactions ?? []).map((reaction) => ({
      _id: reaction.id as Id<'reactions'>,
      _creationTime: Date.parse(message.createdAt),
      workspaceId: message.workspaceId as Id<'workspaces'>,
      messageId: message.id as Id<'messages'>,
      value: reaction.value,
      count: reaction.count ?? 0,
      memberIds: (reaction.memberIds ?? []).map((id) => id as Id<'members'>),
    })),
    threadCount: message.threadCount,
    threadImage: undefined,
    threadName: '',
    threadTimestamp: 0,
  };
};
