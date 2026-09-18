// Autocomplete for process.env in the Calyx web app.
export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_CONVEX_URL?: string;
      CONVEX_DEPLOYMENT?: string;
      CALYX_API_URL?: string;
      NEXT_PUBLIC_CALYX_TENANT_ID?: string;
    }
  }
}
