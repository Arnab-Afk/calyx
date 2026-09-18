import { describe, it, expect } from "vitest";
import {
  gfmToMrkdwn,
  markdownToSlackBlocks,
  fallbackText,
  buildLogListBlocks,
  SLACK_FOLLOWUP_INSTRUCTIONS,
} from "../src/slack/format-answer.js";
import { unwrapServiceStats, toStatusBarServices } from "../src/slack/tool-data.js";

const USER_SAMPLE = `## eventio — tenant overview

**66,753 events across 5 services, 27 errors total (0.04% overall error rate).** Data window spans 2026-08-13 19:47 → 2026-08-21 19:01.

| Service | Events | Errors | Warns | Error rate |
|---|---|---|---|---|
| swdc.somaiya.edu | 24,489 | 10 | 6,051 | 0.04% |
| eventio.somaiya.edu | 24,475 | 0 | 4 | 0% |
| eventio | 17,697 | 17 | 25 | 0.10% |

### The two error signatures

**1. eventio app — 17 errors, all JWT auth failures.** Every one is jwt malformed or jwt expired.
`;

describe("gfmToMrkdwn", () => {
  it("converts **bold** to Slack *bold*", () => {
    expect(gfmToMrkdwn("**66,753 events**")).toBe("*66,753 events*");
  });

  it("converts markdown links to Slack links", () => {
    expect(gfmToMrkdwn("[PR](https://example.com)")).toBe("<https://example.com|PR>");
  });
});

describe("markdownToSlackBlocks", () => {
  it("turns ## headings into header blocks, not raw hashes", () => {
    const blocks = markdownToSlackBlocks(USER_SAMPLE) as {
      type: string;
      text?: { text: string; type?: string };
    }[];
    const headers = blocks.filter((b) => b.type === "header");
    expect(headers.length).toBeGreaterThan(0);
    expect(headers[0].text?.text).toContain("eventio");
    expect(JSON.stringify(blocks)).not.toContain("## ");
  });

  it("does not leave markdown tables as pipe characters", () => {
    const blocks = markdownToSlackBlocks(USER_SAMPLE);
    const json = JSON.stringify(blocks);
    expect(json).toContain("swdc.somaiya.edu");
    expect(json).toContain("24,489");
    expect(json).not.toMatch(/\|---\|/);
  });

  it("converts ### subheadings to bold section text", () => {
    const blocks = markdownToSlackBlocks(USER_SAMPLE);
    const json = JSON.stringify(blocks);
    expect(json).toContain("The two error signatures");
    expect(json).not.toContain("### ");
  });

  it("converts leftover **bold** inside paragraphs", () => {
    const json = JSON.stringify(markdownToSlackBlocks(USER_SAMPLE));
    expect(json).toContain("*66,753 events");
    expect(json).not.toContain("**66,753");
  });
});

describe("fallbackText", () => {
  it("strips GFM so notifications are readable", () => {
    expect(fallbackText("**hello**")).toBe("*hello*");
  });
});

describe("buildLogListBlocks", () => {
  it("renders a compact list instead of 'Found N events'", () => {
    const blocks = buildLogListBlocks(
      [
        {
          timestamp: "2026-08-21T19:01:40.000Z",
          level: "warn",
          service: "swdc.somaiya.edu",
          message: "GET /p/cis 404",
        },
      ],
      "Logs — last 1h"
    );
    const json = JSON.stringify(blocks);
    expect(json).toContain("Logs — last 1h");
    expect(json).toContain("swdc.somaiya.edu");
    expect(json).toContain("404");
    expect(json).not.toContain("Found 50");
  });
});

describe("unwrapServiceStats", () => {
  it("unwraps { stats: [...] } from get_service_stats", () => {
    const stats = unwrapServiceStats({
      stats: [
        {
          service: "eventio",
          total: 17697,
          by_level: { error: 17 },
          error_count: 17,
          error_rate: 0.1,
          first_seen: "2026-08-13T00:00:00.000Z",
          last_seen: "2026-08-21T00:00:00.000Z",
        },
      ],
      total_events: 17697,
      overall_error_rate: 0.1,
    });
    expect(stats).toHaveLength(1);
    expect(stats[0].service).toBe("eventio");
    expect(toStatusBarServices(stats)[0].errorRate).toBe(0.1);
  });

  it("returns empty for log event arrays", () => {
    expect(unwrapServiceStats([{ message: "hi", level: "info" }])).toHaveLength(0);
  });
});

describe("Slack voice", () => {
  it("tells follow-ups to answer in one sentence", () => {
    expect(SLACK_FOLLOWUP_INSTRUCTIONS).toMatch(/one sentence/i);
    expect(SLACK_FOLLOWUP_INSTRUCTIONS).toMatch(/Only happening in the U\.S\./);
  });
});
