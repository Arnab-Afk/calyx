import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/agent/loop.js", () => ({
  runAgent: vi.fn(),
}));

import { runAgent } from "../src/agent/loop.js";
import { askTool } from "../src/agent/tools/ask.js";

const mockedRunAgent = vi.mocked(runAgent);

describe("ask tool", () => {
  beforeEach(() => mockedRunAgent.mockReset());

  it("returns an evidence-aware structured result and prevents recursive ask calls", async () => {
    mockedRunAgent.mockResolvedValue({
      answer: "Checkout has five observed 404 responses.",
      toolCallsMade: [
        {
          toolName: "query_logs",
          input: { tenant_id: "tenant-a", service: "checkout" },
          result: { ok: true, summary: "Found five errors" },
          output: {
            summary: "Found five errors",
            data: [{ message: "GET /checkout 404" }],
            visualization_hint: "table",
          },
        },
      ],
      stopReason: "end_turn",
      turns: 2,
    });

    const output = await askTool.handler({ tenant_id: "tenant-a", question: "Why is checkout returning 404?" });

    expect(mockedRunAgent).toHaveBeenCalledWith(
      "tenant-a",
      "Why is checkout returning 404?",
      undefined,
      expect.stringContaining("observed evidence"),
      4096,
      { excludeTools: ["ask", "propose_remediation"] }
    );
    expect(output.summary).toContain("five observed 404");
    expect(output.data).toMatchObject({
      answer: "Checkout has five observed 404 responses.",
      chartHint: "table",
      turns: 2,
      toolCalls: [{ toolName: "query_logs", ok: true, summary: "Found five errors" }],
    });
  });

  it("rejects empty questions before invoking the agent", async () => {
    const parsed = askTool.inputSchema.safeParse({ tenant_id: "tenant-a", question: "   " });
    expect(parsed.success).toBe(false);
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });
});
