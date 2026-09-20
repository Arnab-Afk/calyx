import { NextRequest, NextResponse } from 'next/server';

function opsBase() {
  return (process.env.CALYX_API_URL || 'http://127.0.0.1:13000').replace(/\/$/, '');
}

function mgmtToken() {
  return process.env.CALYX_MGMT_TOKEN?.trim() || '';
}

async function proxy(request: NextRequest, path: string[]) {
  const token = mgmtToken();
  if (!token) {
    return NextResponse.json(
      { error: 'CALYX_MGMT_TOKEN is not configured on the web server' },
      { status: 503 },
    );
  }

  const suffix = path.join('/');
  const url = new URL(request.url);
  const target = `${opsBase()}/v1/${suffix}${url.search}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
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

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}
