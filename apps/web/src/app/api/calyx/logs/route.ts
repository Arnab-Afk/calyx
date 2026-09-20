import { NextRequest, NextResponse } from 'next/server';

const CALYX_API = (process.env.CALYX_API_URL ?? 'http://localhost:13000').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  const token = process.env.CALYX_MGMT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: 'CALYX_MGMT_TOKEN is not configured on the web server' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const params = new URLSearchParams();
  for (const key of ['service', 'level', 'limit'] as const) {
    const value = searchParams.get(key);
    if (value) params.set(key, value);
  }

  const res = await fetch(`${CALYX_API}/v1/events?${params}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({ error: 'Invalid upstream response' }));
  return NextResponse.json(data, { status: res.status });
}
