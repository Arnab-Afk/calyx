import type { Metadata } from 'next';
import { Inter, Oxanium, Space_Mono } from 'next/font/google';
import type { PropsWithChildren } from 'react';

import './globals.css';

const display = Oxanium({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
});

const body = Inter({
  subsets: ['latin'],
  variable: '--font-landing-body',
});

const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Calyx — Production intelligence for teams that ship',
  description: 'Evidence-backed incident investigation, safe remediation, and production context for fast-moving teams.',
};

export default function RootLayout({ children }: Readonly<PropsWithChildren>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
