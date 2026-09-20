import crypto from "node:crypto";

function appJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replaceAll(
    "\\n",
    "\n",
  );
  if (!appId || !privateKey)
    throw new Error("GitHub App credentials are not configured");
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: appId })}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(unsigned), privateKey)
    .toString("base64url");
  return `${unsigned}.${signature}`;
}

async function github<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "calyx-coding-agent",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`GitHub API ${response.status} for ${path}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function installationToken(installationId: string): Promise<string> {
  const result = await github<{ token: string }>(
    `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    appJwt(),
    { method: "POST", body: "{}" },
  );
  return result.token;
}

export async function getRepositoryFile(input: {
  installationId: string;
  repo: string;
  path: string;
  ref?: string;
}): Promise<{ path: string; content: string; sha: string }> {
  const token = await installationToken(input.installationId);
  const query = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
  const result = await github<{
    path: string;
    content: string;
    encoding: string;
    sha: string;
  }>(
    `/repos/${input.repo}/contents/${input.path.split("/").map(encodeURIComponent).join("/")}${query}`,
    token,
  );
  if (result.encoding !== "base64")
    throw new Error("GitHub returned unsupported file encoding");
  const content = Buffer.from(
    result.content.replaceAll("\n", ""),
    "base64",
  ).toString("utf8");
  if (Buffer.byteLength(content) > 1024 * 1024)
    throw new Error("Repository file exceeds 1 MiB");
  return { path: result.path, content, sha: result.sha };
}

export async function searchRepositoryCode(input: {
  installationId: string;
  repo: string;
  query: string;
}): Promise<Array<{ path: string; sha: string; url: string }>> {
  const token = await installationToken(input.installationId);
  const result = await github<{
    items: Array<{ path: string; sha: string; html_url: string }>;
  }>(
    `/search/code?q=${encodeURIComponent(`${input.query} repo:${input.repo}`)}&per_page=25`,
    token,
  );
  return result.items.map((item) => ({
    path: item.path,
    sha: item.sha,
    url: item.html_url,
  }));
}

export async function provisionGithubRepository(input: {
  installationId: string;
  repo: string;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<void> {
  const installation = await github<{ id: number }>(
    `/repos/${input.repo}/installation`,
    appJwt(),
  );
  if (String(installation.id) !== input.installationId) {
    throw new Error(
      "GitHub installation does not have access to the selected repository",
    );
  }
  const token = await installationToken(input.installationId);
  const hooks = await github<
    Array<{ id: number; active: boolean; config?: { url?: string } }>
  >(`/repos/${input.repo}/hooks?per_page=100`, token);
  const existing = hooks.find((hook) => hook.config?.url === input.webhookUrl);
  const payload = JSON.stringify({
    name: "web",
    active: true,
    events: ["push", "deployment", "deployment_status"],
    config: {
      url: input.webhookUrl,
      content_type: "json",
      secret: input.webhookSecret,
      insecure_ssl: "0",
    },
  });
  if (existing) {
    await github(`/repos/${input.repo}/hooks/${existing.id}`, token, {
      method: "PATCH",
      body: payload,
    });
  } else {
    await github(`/repos/${input.repo}/hooks`, token, {
      method: "POST",
      body: payload,
    });
  }
}

export async function removeGithubRepositoryWebhook(input: {
  installationId: string;
  repo: string;
  webhookUrl: string;
}): Promise<void> {
  const token = await installationToken(input.installationId);
  const hooks = await github<Array<{ id: number; config?: { url?: string } }>>(
    `/repos/${input.repo}/hooks?per_page=100`,
    token,
  );
  const existing = hooks.find((hook) => hook.config?.url === input.webhookUrl);
  if (existing) {
    await github(`/repos/${input.repo}/hooks/${existing.id}`, token, {
      method: "DELETE",
    });
  }
}

export interface PullRequestFile {
  path: string;
  content: string;
}

export async function createCodingPullRequest(input: {
  installationId: string;
  repo: string;
  jobId: string;
  baseRef?: string;
  title: string;
  body: string;
  files: PullRequestFile[];
}): Promise<{ branchName: string; number: number; url: string }> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repo))
    throw new Error("Invalid GitHub repository");
  if (input.files.length < 1 || input.files.length > 50)
    throw new Error("Patch must contain 1-50 files");
  let total = 0;
  for (const file of input.files) {
    if (
      !file.path ||
      file.path.startsWith("/") ||
      file.path.includes("..") ||
      file.path.length > 500
    ) {
      throw new Error(`Invalid patch path: ${file.path}`);
    }
    total += Buffer.byteLength(file.content);
  }
  if (total > 512 * 1024) throw new Error("Patch exceeds 512 KiB");

  const token = await installationToken(input.installationId);
  const repo = await github<{ default_branch: string }>(
    `/repos/${input.repo}`,
    token,
  );
  const baseRef = input.baseRef ?? repo.default_branch;
  const ref = await github<{ object: { sha: string } }>(
    `/repos/${input.repo}/git/ref/heads/${encodeURIComponent(baseRef)}`,
    token,
  );
  const commit = await github<{ tree: { sha: string } }>(
    `/repos/${input.repo}/git/commits/${ref.object.sha}`,
    token,
  );
  const treeEntries = [];
  for (const file of input.files) {
    const blob = await github<{ sha: string }>(
      `/repos/${input.repo}/git/blobs`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      },
    );
    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }
  const tree = await github<{ sha: string }>(
    `/repos/${input.repo}/git/trees`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeEntries }),
    },
  );
  const createdCommit = await github<{ sha: string }>(
    `/repos/${input.repo}/git/commits`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        message: input.title,
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    },
  );
  const branchName = `calyx/${input.jobId}`;
  await github(`/repos/${input.repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: createdCommit.sha,
    }),
  });
  const pull = await github<{ number: number; html_url: string }>(
    `/repos/${input.repo}/pulls`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: branchName,
        base: baseRef,
        draft: true,
      }),
    },
  );
  return { branchName, number: pull.number, url: pull.html_url };
}
