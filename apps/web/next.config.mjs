import { withCalyxLogger } from 'calyx-logger/next';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: resolve(appDirectory, '../..'),
  // Repository-wide legacy style diagnostics are checked separately while the
  // production build still performs Next.js TypeScript validation.
  eslint: { ignoreDuringBuilds: true },
};

export default withCalyxLogger(nextConfig);
