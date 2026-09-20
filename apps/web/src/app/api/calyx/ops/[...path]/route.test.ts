import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyOpsRequest } from './proxy';

const WORKSPACE = 'f67f9d4c-1780-493f-a3aa-b0b54dc2a92d';
const originalFetch = global.fetch;

beforeEach(() => {
  process.env.CALYX_CHAT_URL = 'https://chat.example.test';
  process.env.CALYX_API_URL = 'https://ops.example.test';
  process.env.CALYX_MGMT_TOKEN = 'calyx_mgmt_test';
  process.env.CALYX_INTERNAL_API_KEY = 'internal-test-key';
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.CALYX_CHAT_URL;
  delete process.env.CALYX_API_URL;
  delete process.env.CALYX_MGMT_TOKEN;
  delete process.env.CALYX_INTERNAL_API_KEY;
  vi.restoreAllMocks();
});

function request(cookie?: string) {
  return new NextRequest(
    `https://app.example.test/api/calyx/ops/projects?workspaceId=${WORKSPACE}`,
    { headers: cookie ? { cookie } : undefined },
  );
}

describe('web operations proxy authorization', () => {
  it('rejects requests without the HTTP-only Go session cookie', async () => {
    global.fetch = vi.fn();
    const response = await proxyOpsRequest(request(), ['projects']);
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects non-admin workspace members before using the management token', async () => {
    const mockedFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ role: 'member' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = mockedFetch;
    const response = await proxyOpsRequest(request('calyx_session=signed'), ['projects']);
    expect(response.status).toBe(403);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('checks workspace tenant binding before proxying and strips workspaceId upstream', async () => {
    const mockedFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ role: 'admin' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorized: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ projects: [] }), { status: 200 }));
    global.fetch = mockedFetch;

    const response = await proxyOpsRequest(request('calyx_session=signed'), ['projects']);
    expect(response.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(mockedFetch.mock.calls[0][0]).toBe(
      `https://chat.example.test/v1/workspaces/${WORKSPACE}/members/me`,
    );
    expect(mockedFetch.mock.calls[1][0]).toBe(
      `https://ops.example.test/v1/internal/workspaces/${WORKSPACE}/authorize-management`,
    );
    expect(mockedFetch.mock.calls[2][0]).toBe('https://ops.example.test/v1/projects');
    expect(mockedFetch.mock.calls[2][1].headers.Authorization).toBe('Bearer calyx_mgmt_test');
  });
});
