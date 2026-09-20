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
};
