import { NextRequest, NextResponse } from 'next/server';

function opsBase() {
  return (process.env.CALYX_API_URL || 'http://127.0.0.1:13000').replace(/\/$/, '');
}

function chatBase() {
  return (process.env.CALYX_CHAT_URL || process.env.NEXT_PUBLIC_CALYX_CHAT_URL || 'http://127.0.0.1:14000').replace(/\/$/, '');
}

function mgmtToken() {
  return process.env.CALYX_MGMT_TOKEN?.trim() || '';
}

function internalKey() {
  return process.env.CALYX_INTERNAL_API_KEY?.trim() || '';
}

async function authorizeWorkspaceAdmin(
  request: NextRequest,
  workspaceId: string,
  token: string,
): Promise<{ actorId: string } | NextResponse> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let memberResponse: Response;
  try {
    memberResponse = await fetch(`${chatBase()}/v1/workspaces/${encodeURIComponent(workspaceId)}/members/me`, {
      headers: { Accept: 'application/json', Cookie: cookie },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Calyx chat API unreachable' }, { status: 502 });
  }
  if (memberResponse.status === 401) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!memberResponse.ok) {
    return NextResponse.json({ error: 'Workspace membership required' }, { status: 403 });
  }
  const member = (await memberResponse.json().catch(() => null)) as { id?: string; role?: string } | null;
  if (member?.role !== 'admin' || !member.id) {
    return NextResponse.json({ error: 'Workspace admin access required' }, { status: 403 });
  }

  let tenantResponse: Response;
  try {
    tenantResponse = await fetch(`${opsBase()}/v1/internal/workspaces/${encodeURIComponent(workspaceId)}/authorize-management`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Calyx-Internal-Key': internalKey(),
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Calyx observability API unreachable' }, { status: 502 });
  }
  if (!tenantResponse.ok) {
    return NextResponse.json(
      { error: 'Workspace is not authorized for this observability tenant' },
      { status: tenantResponse.status === 401 ? 503 : 403 },
    );
  }
  return { actorId: `web:${workspaceId}:${member.id}` };
}

export async function proxyOpsRequest(request: NextRequest, path: string[]) {
  const token = mgmtToken();
  const serviceKey = internalKey();
  if (!token || !serviceKey) {
    return NextResponse.json({ error: 'Calyx operations integration is not configured on the web server' }, { status: 503 });
  }
  const requestUrl = new URL(request.url);
  const workspaceId = requestUrl.searchParams.get('workspaceId')?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }
  const authorization = await authorizeWorkspaceAdmin(request, workspaceId, token);
  if (authorization instanceof NextResponse) return authorization;

  requestUrl.searchParams.delete('workspaceId');
  const suffix = path.join('/');
  const query = requestUrl.searchParams.toString();
  const target = `${opsBase()}/v1/${suffix}${query ? `?${query}` : ''}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Calyx-Internal-Key': serviceKey,
    'X-Calyx-Actor-ID': authorization.actorId,
  };
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text();
  if (body) headers['Content-Type'] = 'application/json';

  try {
    const upstream = await fetch(target, { method: request.method, headers, body });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'Calyx observability API unreachable' }, { status: 502 });
  }
}
