import { ConvexAuthNextjsServerProvider } from '@convex-dev/auth/nextjs/server';
import type { Metadata } from 'next';
import { Barlow, Chakra_Petch } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { PropsWithChildren } from 'react';

import { ChatAuthProvider } from '@/components/chat-auth-provider';
import { ConvexClientProvider } from '@/components/convex-client-provider';
import { JotaiProvider } from '@/components/jotai-provider';
import { ModalProvider } from '@/components/modal-provider';
import { Toaster } from '@/components/ui/sonner';
import { siteConfig } from '@/config';

import './globals.css';

const display = Chakra_Petch({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
});

const body = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

export const metadata: Metadata = siteConfig;

const RootLayout = ({ children }: Readonly<PropsWithChildren>) => {
  return (
    <ConvexAuthNextjsServerProvider>
      {/*
        THESIS: Ops chat as a night-NOC HUD — glass panels, crimson signal, not Slack purple.
        OWN-WORLD: Charcoal void + crimson glass, Chakra Petch / Barlow, scanline incident cards.
        STORY: Read alerts, ask Calyx, act — without leaving the channel.
        FIRST VIEWPORT: Dark message river, Calyx alert cards, red Send composer.
        FORM: Brief-pinned Sazabi reference applied to Calyx messaging.
        FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
      */}
      <html lang="en" className="dark">
        <body className={`${display.variable} ${body.variable} font-[family-name:var(--font-body)] antialiased`}>
          <ConvexClientProvider>
            <ChatAuthProvider>
              <JotaiProvider>
                <NuqsAdapter>
                  <Toaster theme="dark" richColors closeButton />
                  <ModalProvider />

                  {children}
                </NuqsAdapter>
              </JotaiProvider>
            </ChatAuthProvider>
          </ConvexClientProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
};

export default RootLayout;
