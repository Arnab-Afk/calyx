import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { fetchQuery } from 'convex/nextjs';
import { NextRequest, NextResponse } from 'next/server';

import { api } from '@/../convex/_generated/api';
import type { Id } from '@/../convex/_generated/dataModel';

const CALYX_API = process.env.CALYX_API_URL ?? 'http://localhost:13000';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
  const internalKey = process.env.CALYX_INTERNAL_API_KEY;
  if (!workspaceId || !internalKey) {
    return NextResponse.json({ error: 'Trusted Calyx ask is not configured' }, { status: 503 });
  }
  const token = await convexAuthNextjsToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const member = await fetchQuery(
      api.members.current,
      { workspaceId: workspaceId as Id<'workspaces'> },
      { token },
    );
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const res = await fetch(`${CALYX_API}/v1/internal/workspaces/${encodeURIComponent(workspaceId)}/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Calyx-Internal-Key': internalKey,
    },
    body: JSON.stringify({ message: body.message }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
