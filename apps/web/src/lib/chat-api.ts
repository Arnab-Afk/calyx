export interface ChatUser {
  id: string;
  email: string;
  name: string;
  image?: string;
  createdAt: string;
}

export interface ChatWorkspace {
  id: string;
  name: string;
  joinCode: string;
  ownerId: string;
  createdAt: string;
}

export interface ChatMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'admin' | 'member';
  createdAt: string;
  user?: ChatUser;
}

export interface ChatChannel {
  id: string;
  name: string;
  workspaceId: string;
  createdAt: string;
}

export interface ChatReaction {
  id: string;
  messageId: string;
  memberId?: string;
  value: string;
  count?: number;
}

export interface ChatCalyxData {
  query: string;
  answer: string;
  chartType?: string;
  chartData?: string;
  toolNames: string[];
}

export interface ChatMessage {
  id: string;
  body: string;
  memberId: string;
  workspaceId: string;
  channelId?: string;
  parentMessageId?: string;
  conversationId?: string;
  imageUrl?: string;
  calyxData?: ChatCalyxData;
  createdAt: string;
  updatedAt?: string;
  member?: ChatMember;
  reactions?: ChatReaction[];
  threadCount: number;
}

export interface ChatConversation {
  id: string;
  workspaceId: string;
  memberOneId: string;
  memberTwoId: string;
  createdAt: string;
}

export interface ChatRealtimeEvent {
  type: string;
  workspaceId: string;
  channelId?: string;
  payload: unknown;
}

export class ChatApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ChatApiError';
  }
}

export const chatApiUrl = process.env.NEXT_PUBLIC_CALYX_CHAT_URL?.replace(/\/$/, '') ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!chatApiUrl) throw new ChatApiError(503, 'NEXT_PUBLIC_CALYX_CHAT_URL is not configured');
  const response = await fetch(`${chatApiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ChatApiError(response.status, payload?.error ?? `Chat API returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const chatApi = {
  register: (input: { email: string; password: string; name: string }) =>
    request<{ user: ChatUser }>('/v1/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    request<{ user: ChatUser }>('/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<{ ok: boolean }>('/v1/auth/logout', { method: 'POST' }),
  me: (signal?: AbortSignal) => request<ChatUser>('/v1/auth/me', { signal }),
  workspaces: (signal?: AbortSignal) => request<{ workspaces: ChatWorkspace[] }>('/v1/workspaces', { signal }),
  createWorkspace: (name: string) =>
    request<{ workspace: ChatWorkspace; memberId: string }>('/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  workspace: (id: string, signal?: AbortSignal) => request<ChatWorkspace>(`/v1/workspaces/${encodeURIComponent(id)}`, { signal }),
  workspaceInfo: (id: string, signal?: AbortSignal) =>
    request<{ name: string; isMember: boolean; role: '' | 'admin' | 'member' }>(`/v1/workspaces/${encodeURIComponent(id)}/info`, {
      signal,
    }),
  updateWorkspace: (id: string, name: string) =>
    request<{ id: string; name: string }>(`/v1/workspaces/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteWorkspace: (id: string) => request<{ ok: boolean }>(`/v1/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  joinWorkspace: (workspaceId: string, joinCode: string) =>
    request<{ workspace: ChatWorkspace }>('/v1/workspaces/join', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, joinCode }),
    }),
  rotateJoinCode: (workspaceId: string) =>
    request<{ joinCode: string }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/join-code`, {
      method: 'POST',
    }),
  currentMember: (workspaceId: string, signal?: AbortSignal) =>
    request<ChatMember>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/members/me`, { signal }),
  members: (workspaceId: string, signal?: AbortSignal) =>
    request<{ members: ChatMember[] }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/members`, { signal }),
  member: (memberId: string, signal?: AbortSignal) => request<ChatMember>(`/v1/members/${encodeURIComponent(memberId)}`, { signal }),
  updateMember: (memberId: string, role: ChatMember['role']) =>
    request<{ id: string; role: ChatMember['role'] }>(`/v1/members/${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  deleteMember: (memberId: string) => request<{ ok: boolean }>(`/v1/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }),
  channels: (workspaceId: string, signal?: AbortSignal) =>
    request<{ channels: ChatChannel[] }>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/channels`, { signal }),
  channel: (channelId: string, signal?: AbortSignal) => request<ChatChannel>(`/v1/channels/${encodeURIComponent(channelId)}`, { signal }),
  createChannel: (workspaceId: string, name: string) =>
    request<ChatChannel>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/channels`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateChannel: (channelId: string, name: string) =>
    request<ChatChannel>(`/v1/channels/${encodeURIComponent(channelId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteChannel: (channelId: string) => request<{ ok: boolean }>(`/v1/channels/${encodeURIComponent(channelId)}`, { method: 'DELETE' }),
  channelMessages: (channelId: string, options?: { parentMessageId?: string; limit?: number; signal?: AbortSignal }) => {
    const query = new URLSearchParams();
    if (options?.parentMessageId) query.set('parentMessageId', options.parentMessageId);
    if (options?.limit) query.set('limit', String(options.limit));
    return request<{ messages: ChatMessage[] }>(`/v1/channels/${encodeURIComponent(channelId)}/messages?${query}`, {
      signal: options?.signal,
    });
  },
  createChannelMessage: (channelId: string, input: { body: string; parentMessageId?: string; imageId?: string }) =>
    request<ChatMessage>(`/v1/channels/${encodeURIComponent(channelId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  message: (messageId: string, signal?: AbortSignal) => request<ChatMessage>(`/v1/messages/${encodeURIComponent(messageId)}`, { signal }),
  updateMessage: (messageId: string, body: string) =>
    request<ChatMessage>(`/v1/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  deleteMessage: (messageId: string) => request<{ ok: boolean }>(`/v1/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
  toggleReaction: (messageId: string, value: string) =>
    request<{ added: boolean; value: string }>(`/v1/messages/${encodeURIComponent(messageId)}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    }),
  conversation: (conversationId: string, signal?: AbortSignal) =>
    request<ChatConversation>(`/v1/conversations/${encodeURIComponent(conversationId)}`, { signal }),
  createOrGetConversation: (workspaceId: string, memberId: string) =>
    request<ChatConversation>(`/v1/workspaces/${encodeURIComponent(workspaceId)}/conversations`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    }),
  conversationMessages: (conversationId: string, options?: { parentMessageId?: string; limit?: number; signal?: AbortSignal }) => {
    const query = new URLSearchParams();
    if (options?.parentMessageId) query.set('parentMessageId', options.parentMessageId);
    if (options?.limit) query.set('limit', String(options.limit));
    return request<{ messages: ChatMessage[] }>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages?${query}`, {
      signal: options?.signal,
    });
  },
  createConversationMessage: (conversationId: string, input: { body: string; parentMessageId?: string; imageId?: string }) =>
    request<ChatMessage>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  askCalyx: (channelId: string, query: string, parentMessageId?: string) =>
    request<{ question: ChatMessage; message: ChatMessage }>(`/v1/channels/${encodeURIComponent(channelId)}/calyx`, {
      method: 'POST',
      body: JSON.stringify({ query, parentMessageId }),
    }),
};

export async function uploadChatImage(workspaceId: string, file: File) {
  if (!chatApiUrl) throw new ChatApiError(503, 'NEXT_PUBLIC_CALYX_CHAT_URL is not configured');
  const form = new FormData();
  form.set('file', file);
  const response = await fetch(`${chatApiUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/uploads`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!response.ok) throw new ChatApiError(response.status, 'Image upload failed');
  return response.json() as Promise<{ id: string; url: string; contentType: string; size: number }>;
}

export function connectChatRealtime(workspaceId: string, onEvent: (event: ChatRealtimeEvent) => void): WebSocket {
  if (!chatApiUrl) throw new ChatApiError(503, 'NEXT_PUBLIC_CALYX_CHAT_URL is not configured');
  const endpoint = new URL(chatApiUrl);
  endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  endpoint.pathname = `/v1/workspaces/${encodeURIComponent(workspaceId)}/ws`;
  const socket = new WebSocket(endpoint);
  socket.addEventListener('message', (message) => {
    try {
      const event = JSON.parse(String(message.data)) as ChatRealtimeEvent;
      if (event.type !== 'connected') onEvent(event);
    } catch {
      // Ignore malformed provider frames; the next valid event remains usable.
    }
  });
  return socket;
}
