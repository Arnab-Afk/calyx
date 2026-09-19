import { describe, expect, it } from "vitest";
import { connectorConfig } from "./config.js";

describe("connectorConfig", () => {
  it("requires a URL and token", () => {
    expect(() => connectorConfig({})).toThrow(/CALYX_MCP_URL/);
    expect(() => connectorConfig({ CALYX_MCP_URL: "https://mcp.example.com/mcp" })).toThrow(
      /CALYX_API_KEY/
    );
  });

  it("requires HTTPS outside localhost", () => {
    expect(() =>
      connectorConfig({ CALYX_MCP_URL: "http://mcp.example.com/mcp", CALYX_API_KEY: "secret" })
    ).toThrow(/HTTPS/);
    expect(connectorConfig({
      CALYX_MCP_URL: "http://localhost:13002/mcp",
      CALYX_API_KEY: "secret",
    }).url.toString()).toBe("http://localhost:13002/mcp");
  });
});
