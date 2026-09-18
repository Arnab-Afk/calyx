import { NextRequest, NextResponse } from 'next/server';

const CALYX_API = process.env.CALYX_API_URL ?? 'http://localhost:13000';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = req.headers.get('x-tenant-id') ?? searchParams.get('tenantId') ?? 'default';

  const params = new URLSearchParams();
  for (const [k, v] of searchParams.entries()) {
    if (k !== 'tenantId') params.set(k, v);
  }

  const res = await fetch(`${CALYX_API}/v1/logs?${params}`, {
    headers: { 'X-Tenant-ID': tenantId },
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
