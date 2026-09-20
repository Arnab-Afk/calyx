'use client';

import Image from 'next/image';
import { useState } from 'react';

import type { SignInFlow } from '../types';
import { SignInCard } from './sign-in-card';
import { SignUpCard } from './sign-up-card';

export const AuthScreen = () => {
  const [state, setState] = useState<SignInFlow>('signIn');

  return (
    <div className="flex min-h-dvh w-full flex-col bg-[var(--sazabi-void)] selection:bg-[var(--sazabi-crimson)]/30 selection:text-white lg:flex-row">
      <aside className="relative flex min-h-[42vh] w-full flex-col justify-between overflow-hidden p-8 md:p-12 lg:min-h-dvh lg:w-1/2">
        <Image
          src="/calyx-auth-hero.png"
          alt="Night operations floor"
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,6,0.28)_0%,rgba(5,5,6,0.15)_40%,rgba(5,5,6,0.82)_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.45) 2px, rgba(0,0,0,0.45) 3px)',
          }}
        />

        <div className="relative z-10">
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-white md:text-xl">
            Calyx
          </p>
        </div>

        <div className="relative z-10 mt-12 max-w-xl lg:mt-0">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-medium leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
            The night shift
            <br />
            in one channel.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/85 sm:text-lg">
            Incidents, deploys, and the ask stay in the thread — Calyx answers from the same ops room.
          </p>
        </div>
      </aside>

      <main className="flex w-full flex-col items-center justify-center px-6 py-12 sm:px-12 lg:w-1/2">
        <div
          key={state}
          className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2 duration-500 md:max-w-lg"
        >
          {state === 'signIn' ? <SignInCard setState={setState} /> : <SignUpCard setState={setState} />}
        </div>
      </main>
    </div>
  );
};
