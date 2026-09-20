import type { Doc, Id } from '@/../convex/_generated/dataModel';
import type { ChatChannel, ChatMember, ChatUser, ChatWorkspace } from '@/lib/chat-api';

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
