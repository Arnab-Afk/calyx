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
  return new NextRequest(`https://app.example.test/api/calyx/ops/projects?workspaceId=${WORKSPACE}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function mockByUrl(handlers: Record<string, Response | (() => Response)>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    for (const [match, res] of Object.entries(handlers)) {
      if (url.includes(match)) return typeof res === 'function' ? res() : res;
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('web operations proxy authorization', () => {
  it('rejects requests without the HTTP-only Go session cookie', async () => {
    global.fetch = vi.fn();
    const response = await proxyOpsRequest(request(), ['projects']);
    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects workspace members without an id before proxying projects', async () => {
    const mockedFetch = mockByUrl({
      '/members/me': new Response(JSON.stringify({ role: 'member' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      '/authorize-management': new Response(JSON.stringify({ authorized: true }), { status: 200 }),
    });
    global.fetch = mockedFetch;
    const response = await proxyOpsRequest(request('calyx_session=signed'), ['projects']);
    expect(response.status).toBe(403);
    expect(mockedFetch).toHaveBeenCalled();
    expect(mockedFetch.mock.calls.some((c) => String(c[0]).includes('/v1/projects'))).toBe(false);
  });

  it('checks workspace tenant binding before proxying and strips workspaceId upstream', async () => {
    const mockedFetch = mockByUrl({
      '/members/me': new Response(JSON.stringify({ id: 'member-1', role: 'admin' }), { status: 200 }),
      '/authorize-management': new Response(JSON.stringify({ authorized: true }), { status: 200 }),
      '/v1/projects': new Response(JSON.stringify({ projects: [] }), { status: 200 }),
    });
    global.fetch = mockedFetch;

    const response = await proxyOpsRequest(request('calyx_session=signed'), ['projects']);
    expect(response.status).toBe(200);
    expect(mockedFetch).toHaveBeenCalledTimes(3);

    const urls = mockedFetch.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(`https://chat.example.test/v1/workspaces/${WORKSPACE}/members/me`);
    expect(urls).toContain(`https://ops.example.test/v1/internal/workspaces/${WORKSPACE}/authorize-management`);
    expect(urls).toContain('https://ops.example.test/v1/projects');

    const projectsCall = mockedFetch.mock.calls.find((c) => String(c[0]).endsWith('/v1/projects'));
    const projectsInit = projectsCall?.[1] as { headers?: Record<string, string> } | undefined;
    expect(projectsInit?.headers?.Authorization).toBe('Bearer calyx_mgmt_test');
    expect(projectsInit?.headers?.['X-Calyx-Internal-Key']).toBe('internal-test-key');
    expect(projectsInit?.headers?.['X-Calyx-Actor-ID']).toBe(`web:${WORKSPACE}:member-1`);
  });
});
