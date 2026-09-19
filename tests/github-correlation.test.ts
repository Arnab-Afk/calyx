import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/storage/github.js", () => ({
  getGithubChangeContext: vi.fn(),
}));

import { getGithubChangeContext } from "../src/storage/github.js";
import { getChangeContextTool } from "../src/agent/tools/get_change_context.js";
import { verifyGithubSignature } from "../src/ingestion/routes/v1/github-webhook.js";

const mockedContext = vi.mocked(getGithubChangeContext);

describe("GitHub correlation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies webhook signatures without accepting malformed values", () => {
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyGithubSignature("secret", body, signature)).toBe(true);
    expect(verifyGithubSignature("secret", body, "sha256=bad")).toBe(false);
    expect(verifyGithubSignature("secret", body, undefined)).toBe(false);
  });

  it("returns tenant-scoped commits and deployments for an incident window", async () => {
    mockedContext.mockResolvedValue({
      commits: [{ sha: "abc123", repo: "calyx/app" }],
      deployments: [{ deployment_id: "42", sha: "abc123", status: "success" }],
    });
    const output = await getChangeContextTool.handler({
      tenant_id: "tenant-a",
      since: "2026-09-20T00:00:00.000Z",
      until: "2026-09-20T01:00:00.000Z",
      limit: 50,
    });
    expect(mockedContext).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }));
    expect(output.summary).toContain("1 deployment(s) and 1 commit(s)");
  });

  it("rejects reversed windows", async () => {
    await expect(getChangeContextTool.handler({
      tenant_id: "tenant-a",
      since: "2026-09-20T02:00:00.000Z",
      until: "2026-09-20T01:00:00.000Z",
      limit: 50,
    })).rejects.toThrow("since must be before until");
  });
});
