// Autocomplete for process.env in the Calyx web app.
export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_CALYX_CHAT_URL?: string;
      NEXT_PUBLIC_CALYX_MCP_URL?: string;
      CALYX_API_URL?: string;
      CALYX_MGMT_TOKEN?: string;
    }
  }
}
