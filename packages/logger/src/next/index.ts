import { createRequire } from "node:module";

type NextConfig = Record<string, unknown> & {
  webpack?: (config: WebpackConfig, options: WebpackOptions) => WebpackConfig;
  instrumentationClientInject?: string[];
};

type WebpackConfig = {
  entry?: unknown;
};

type WebpackOptions = {
  isServer?: boolean;
  webpack?: unknown;
};

const REGISTER = "calyx-logger/next/register";
const require = createRequire(import.meta.url);

function nextMajorMinor(): { major: number; minor: number } | null {
  try {
    const pkg = require("next/package.json") as { version?: string };
    const m = /^(\d+)\.(\d+)/.exec(pkg.version ?? "");
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]) };
  } catch {
    return null;
  }
}

/** `instrumentationClientInject` landed in Next.js 16.3. */
function supportsInstrumentationClientInject(): boolean {
  const v = nextMajorMinor();
  if (!v) return false;
  return v.major > 16 || (v.major === 16 && v.minor >= 3);
}

function prependEntry(entry: unknown): unknown {
  if (typeof entry === "string") {
    return entry === REGISTER ? entry : [REGISTER, entry];
  }
  if (Array.isArray(entry)) {
    return entry.includes(REGISTER) ? entry : [REGISTER, ...entry];
  }
  if (entry && typeof entry === "object") {
    const out: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
    for (const key of Object.keys(out)) {
      if (/server|edge|middleware/i.test(key)) continue;
      out[key] = prependEntry(out[key]);
    }
    return out;
  }
  return entry;
}

/**
 * Next.js plugin — install + env + wrap config. No layout / provider changes.
 *
 * ```js
 * // next.config.mjs
 * import { withCalyxLogger } from 'calyx-logger/next'
 * export default withCalyxLogger({})
 * ```
 *
 * Env (frontend):
 * - NEXT_PUBLIC_CALYX_INTAKE_URL
 * - NEXT_PUBLIC_CALYX_SOURCE_TOKEN
 * - NEXT_PUBLIC_CALYX_SERVICE (optional)
 *
 * Next 16.3+: `instrumentationClientInject`.
 * Next 15.3–16.2: webpack-prepends the register module into client entries.
 */
export function withCalyxLogger(nextConfig: NextConfig = {}): NextConfig {
  const userWebpack = nextConfig.webpack;
  const useInject = supportsInstrumentationClientInject();

  const config: NextConfig = {
    ...nextConfig,
    webpack(webpackConfig: WebpackConfig, options: WebpackOptions) {
      if (!useInject && !options.isServer) {
        const prev = webpackConfig.entry;
        webpackConfig.entry = async () => {
          const entries =
            typeof prev === "function" ? await (prev as () => Promise<unknown>)() : prev;
          return prependEntry(entries);
        };
      }

      if (typeof userWebpack === "function") {
        return userWebpack(webpackConfig, options);
      }
      return webpackConfig;
    },
  };

  if (useInject) {
    config.instrumentationClientInject = [
      ...(nextConfig.instrumentationClientInject ?? []),
      REGISTER,
    ];
  }

  return config;
}

export default withCalyxLogger;
