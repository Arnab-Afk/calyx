export interface ConnectorConfig {
  url: URL;
  token: string;
}

export function connectorConfig(env: NodeJS.ProcessEnv = process.env): ConnectorConfig {
  const rawUrl = env.CALYX_MCP_URL;
  const token = env.CALYX_API_KEY;
  if (!rawUrl) throw new Error("CALYX_MCP_URL is required");
  if (!token) throw new Error("CALYX_API_KEY is required");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("CALYX_MCP_URL must use HTTPS outside localhost");
  }
  return { url, token };
}
