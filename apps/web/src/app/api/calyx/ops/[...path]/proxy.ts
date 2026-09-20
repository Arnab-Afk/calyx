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

type ProjectScope = { projectId: string; projectSlug: string; hostWorkspaceId?: string };

async function authorizeWorkspaceMember(
  request: NextRequest,
  workspaceId: string,
  token: string,
): Promise<{ actorId: string; projectScope: ProjectScope | null } | NextResponse> {
  const cookie = request.headers.get('cookie');
  if (!cookie) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const memberUrl = `${chatBase()}/v1/workspaces/${encodeURIComponent(workspaceId)}/members/me`;
  const tenantUrl = `${opsBase()}/v1/internal/workspaces/${encodeURIComponent(workspaceId)}/authorize-management`;

  let memberResponse: Response;
  let tenantResponse: Response;
  try {
    // Parallel — these don't depend on each other.
    ;[memberResponse, tenantResponse] = await Promise.all([
      fetch(memberUrl, {
        headers: { Accept: 'application/json', Cookie: cookie },
        cache: 'no-store',
      }),
      fetch(tenantUrl, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Calyx-Internal-Key': internalKey(),
        },
        cache: 'no-store',
      }),
    ]);
  } catch {
    return NextResponse.json({ error: 'Calyx backend unreachable' }, { status: 502 });
  }
  if (memberResponse.status === 401) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!memberResponse.ok) {
    return NextResponse.json({ error: 'Workspace membership required' }, { status: 403 });
  }
  const member = (await memberResponse.json().catch(() => null)) as { id?: string; role?: string } | null;
  if (!member?.id) {
    return NextResponse.json({ error: 'Workspace membership required' }, { status: 403 });
  }

  if (!tenantResponse.ok) {
    return NextResponse.json(
      { error: 'Workspace is not authorized for this observability tenant' },
      { status: tenantResponse.status === 401 ? 503 : 403 },
    );
  }
  const authBody = (await tenantResponse.json().catch(() => null)) as {
    projectScope?: ProjectScope | null;
  } | null;

  return {
    actorId: `web:${workspaceId}:${member.id}`,
    projectScope: authBody?.projectScope ?? null,
  };
}

function projectPathAllowed(path: string[], scope: ProjectScope | null): boolean {
  if (!scope) return true;
  // Scoped workspaces cannot create new projects.
  if (path.length === 1 && path[0] === 'projects') {
    return true; // GET list filtered; POST blocked separately
  }
  if (path[0] !== 'projects' || path.length < 2) return true;
  const idOrSlug = decodeURIComponent(path[1]);
  return idOrSlug === scope.projectId || idOrSlug === scope.projectSlug;
}

function filterProjectsPayload(text: string, scope: ProjectScope): string {
  try {
    const data = JSON.parse(text) as { projects?: Array<{ id?: string; slug?: string }> } | Array<{ id?: string; slug?: string }>;
    if (Array.isArray(data)) {
      return JSON.stringify(data.filter((p) => p.id === scope.projectId || p.slug === scope.projectSlug));
    }
    if (data && Array.isArray(data.projects)) {
      return JSON.stringify({
        ...data,
        projects: data.projects.filter((p) => p.id === scope.projectId || p.slug === scope.projectSlug),
      });
    }
  } catch {
    /* keep original */
  }
  return text;
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
  const authorization = await authorizeWorkspaceMember(request, workspaceId, token);
  if (authorization instanceof NextResponse) return authorization;

  const scope = authorization.projectScope;
  if (scope && request.method === 'POST' && path.length === 1 && path[0] === 'projects') {
    return NextResponse.json({ error: 'This shared project workspace cannot create new projects' }, { status: 403 });
  }
  if (!projectPathAllowed(path, scope)) {
    return NextResponse.json({ error: 'Project is outside this workspace scope' }, { status: 403 });
  }

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
    let text = await upstream.text();
    if (
      scope &&
      request.method === 'GET' &&
      path.length === 1 &&
      path[0] === 'projects' &&
      upstream.ok
    ) {
      text = filterProjectsPayload(text, scope);
    }
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
    });
  } catch {
    return NextResponse.json({ error: 'Calyx observability API unreachable' }, { status: 502 });
  }
}
