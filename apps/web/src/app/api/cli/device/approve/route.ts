import { NextRequest, NextResponse } from 'next/server';

function opsBase() {
  return (process.env.CALYX_API_URL || 'http://127.0.0.1:13000').replace(/\/$/, '');
}

function chatBase() {
  return (process.env.CALYX_CHAT_URL || process.env.NEXT_PUBLIC_CALYX_CHAT_URL || 'http://127.0.0.1:14000').replace(
    /\/$/,
    '',
  );
}

function internalKey() {
  return process.env.CALYX_INTERNAL_API_KEY?.trim() || '';
}

export async function POST(request: NextRequest) {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const serviceKey = internalKey();
  if (!serviceKey) {
    return NextResponse.json({ error: 'CLI device auth is not configured on the web server' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    user_code?: string;
    workspace_id?: string;
  } | null;
  const userCode = body?.user_code?.trim();
  const workspaceId = body?.workspace_id?.trim();
  if (!userCode || !workspaceId) {
    return NextResponse.json({ error: 'user_code and workspace_id are required' }, { status: 400 });
  }

  let memberResponse: Response;
  try {
    memberResponse = await fetch(`${chatBase()}/v1/workspaces/${encodeURIComponent(workspaceId)}/members/me`, {
      headers: { Accept: 'application/json', Cookie: cookie },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Chat API unreachable' }, { status: 502 });
  }

  if (memberResponse.status === 401) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (!memberResponse.ok) {
    return NextResponse.json({ error: 'Workspace membership required' }, { status: 403 });
  }

  const member = (await memberResponse.json().catch(() => null)) as { id?: string } | null;
  if (!member?.id) {
    return NextResponse.json({ error: 'Workspace membership required' }, { status: 403 });
  }

  let approveResponse: Response;
  try {
    approveResponse = await fetch(`${opsBase()}/v1/internal/cli/device/approve`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Calyx-Internal-Key': serviceKey,
      },
      body: JSON.stringify({
        user_code: userCode,
        workspace_id: workspaceId,
        actor_id: member.id,
      }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ error: 'Calyx intake unreachable' }, { status: 502 });
  }

  const payload = await approveResponse.json().catch(() => ({}));
  if (!approveResponse.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error || 'Could not approve device' },
      { status: approveResponse.status },
    );
  }

  return NextResponse.json(payload);
}
