import { NextRequest, NextResponse } from 'next/server';

const CALYX_API = process.env.CALYX_API_URL ?? 'http://localhost:13000';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const tenantId = req.headers.get('x-tenant-id') ?? body.tenantId ?? 'default';

  const res = await fetch(`${CALYX_API}/v1/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
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
