import type { Metadata } from 'next';

export const siteConfig: Metadata = {
  title: 'Calyx',
  description:
    'Calyx workspace — Slack-style messaging with observability AI replies and Grafana-like charts.',
  keywords: [
    'calyx',
    'observability',
    'nextjs',
    'real-time-messaging',
    'typescript',
  ] as Array<string>,
  authors: {
    name: 'arnab-afk',
    url: 'https://github.com/Arnab-Afk/calyx',
  },
} as const;

export const links = {
  sourceCode: 'https://github.com/Arnab-Afk/calyx',
} as const;
