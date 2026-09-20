import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCodingPullRequest,
  provisionGithubRepository,
} from "../src/github/app.js";

const originalFetch = global.fetch;

beforeEach(() => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
});

afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  vi.restoreAllMocks();
});

describe("GitHub App pull-request handoff", () => {
  it("creates a draft branch and pull request without merge authority", async () => {
    const replies = [
      { token: "installation-token" },
      { default_branch: "main" },
      { object: { sha: "base-sha" } },
      { tree: { sha: "base-tree" } },
      { sha: "blob-sha" },
      { sha: "tree-sha" },
      { sha: "commit-sha" },
      {},
      { number: 42, html_url: "https://github.com/acme/api/pull/42" },
    ];
    const mockedFetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(replies.shift()), { status: 200 }),
      );
    global.fetch = mockedFetch;

    const result = await createCodingPullRequest({
      installationId: "99",
      repo: "acme/api",
      jobId: "job-1",
      title: "Fix API crash",
      body: "Generated for an incident; requires review.",
      files: [{ path: "src/api.ts", content: "export const ok = true;" }],
    });

    expect(result).toEqual({
      branchName: "calyx/job-1",
      number: 42,
      url: "https://github.com/acme/api/pull/42",
    });
    const pullCall = mockedFetch.mock.calls.at(-1)!;
    expect(pullCall[0]).toBe("https://api.github.com/repos/acme/api/pulls");
    expect(JSON.parse(pullCall[1].body)).toMatchObject({
      head: "calyx/job-1",
      base: "main",
      draft: true,
    });
    expect(
      mockedFetch.mock.calls.some(([url]) => String(url).includes("/merges")),
    ).toBe(false);
  });

  it("validates installation ownership and provisions the signed webhook", async () => {
    const replies = [{ id: 99 }, { token: "installation-token" }, [], {}];
    const mockedFetch = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(replies.shift()), { status: 200 }),
      );
    global.fetch = mockedFetch;
    await provisionGithubRepository({
      installationId: "99",
      repo: "acme/api",
      webhookUrl: "https://calyx.example/v1/webhooks/github/project",
      webhookSecret: "webhook-secret",
    });
    expect(mockedFetch.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/acme/api/installation",
    );
    const hookCall = mockedFetch.mock.calls.at(-1)!;
    expect(hookCall[0]).toBe("https://api.github.com/repos/acme/api/hooks");
    expect(JSON.parse(hookCall[1].body)).toMatchObject({
      active: true,
      events: ["push", "deployment", "deployment_status"],
      config: {
        url: "https://calyx.example/v1/webhooks/github/project",
        secret: "webhook-secret",
      },
    });
  });

  it("rejects an installation that does not own the selected repository", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 100 }), { status: 200 }),
      );
    await expect(
      provisionGithubRepository({
        installationId: "99",
        repo: "acme/api",
        webhookUrl: "https://calyx.example/hook",
        webhookSecret: "secret",
      }),
    ).rejects.toThrow(/does not have access/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects traversal and oversized patches before requesting a token", async () => {
    global.fetch = vi.fn();
    await expect(
      createCodingPullRequest({
        installationId: "99",
        repo: "acme/api",
        jobId: "job-2",
        title: "bad",
        body: "",
        files: [{ path: "../secret", content: "x" }],
      }),
    ).rejects.toThrow(/Invalid patch path/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
