import { describe, it, expect } from "vitest";
import { toOpenAiTool } from "../src/schemas/index.js";
import { getServiceStatsTool } from "../src/agent/tools/get_service_stats.js";
import { agentProvider } from "../src/agent/loop.js";

describe("toOpenAiTool", () => {
  it("wraps a Calyx tool as an OpenAI function", () => {
    const t = toOpenAiTool(getServiceStatsTool);
    expect(t.type).toBe("function");
    expect(t.function.name).toBe("get_service_stats");
    expect(t.function.parameters.type).toBe("object");
    expect(t.function.parameters.required).toContain("tenant_id");
  });
});

describe("agentProvider", () => {
  it("explicit override wins — Slack can force Opus", () => {
    expect(agentProvider("anthropic")).toBe("anthropic");
    expect(agentProvider("nvidia")).toBe("nvidia");
  });
});

describe("toOpenAiTool", () => {
  it("wraps a Calyx tool as an OpenAI function", () => {
    const t = toOpenAiTool(getServiceStatsTool);
    expect(t.type).toBe("function");
    expect(t.function.name).toBe("get_service_stats");
    expect(t.function.parameters.type).toBe("object");
    expect(t.function.parameters.required).toContain("tenant_id");
  });
});
