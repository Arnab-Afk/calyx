import { describe, it, expect } from "vitest";
import { fallbackAck } from "../src/slack/quick-ack.js";

describe("fallbackAck", () => {
  it("echoes the question as a checking line", () => {
    expect(fallbackAck("eventio status", false)).toMatch(/eventio status/i);
  });

  it("is shorter for follow-ups", () => {
    const text = fallbackAck("is it regional?", true);
    expect(text.length).toBeLessThan(80);
    expect(text.toLowerCase()).toContain("checking");
  });

  it("handles empty input", () => {
    expect(fallbackAck("   ", false)).toBe("Checking now.");
    expect(fallbackAck("", true)).toBe("On it.");
  });
});
