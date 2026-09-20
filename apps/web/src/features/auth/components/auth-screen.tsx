'use client';

import { useState } from 'react';

import type { SignInFlow } from '../types';
import { SignInCard } from './sign-in-card';
import { SignUpCard } from './sign-up-card';

const STEPS = [
  { n: 1, label: 'Sign in to your account' },
  { n: 2, label: 'Open your workspace' },
  { n: 3, label: 'Ask Calyx in channel' },
] as const;

const SIGNUP_STEPS = [
  { n: 1, label: 'Sign up your account' },
  { n: 2, label: 'Set up your workspace' },
  { n: 3, label: 'Invite your team' },
] as const;

export const AuthScreen = () => {
  const [state, setState] = useState<SignInFlow>('signIn');
  const steps = state === 'signIn' ? STEPS : SIGNUP_STEPS;
  const activeStep = 1;

  return (
    <div className="flex min-h-dvh w-full bg-[var(--sazabi-void)]">
      {/* Left — brand + steps */}
      <aside className="relative hidden w-[46%] overflow-hidden lg:flex lg:flex-col">
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 80% 60% at 20% 30%, rgba(225, 29, 46, 0.35), transparent 55%),
              radial-gradient(ellipse 70% 50% at 85% 75%, rgba(225, 29, 46, 0.18), transparent 50%),
              radial-gradient(ellipse 50% 40% at 50% 100%, rgba(80, 10, 20, 0.5), transparent 60%),
              linear-gradient(165deg, #12080a 0%, #050506 45%, #0a0608 100%)
            `,
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 3px)',
          }}
        />
        <div
          className="calyx-auth-pulse pointer-events-none absolute -left-24 top-1/4 size-[420px] rounded-full opacity-40 blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(225,29,46,0.45), transparent 70%)',
          }}
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          <p className="animate-in fade-in slide-in-from-left-2 font-[family-name:var(--font-display)] text-sm font-semibold tracking-[0.28em] text-white/70 duration-700">
            CALYX
          </p>

          <div className="max-w-md animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both [animation-delay:120ms]">
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-[1.15] tracking-tight text-white xl:text-5xl">
              {state === 'signIn' ? 'Welcome back.' : 'Get started with us.'}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-white/55">
              {state === 'signIn'
                ? 'Sign in to your ops workspace — channels, incidents, and Calyx in one place.'
                : 'Complete these easy steps to register your account.'}
            </p>
          </div>

          <ol className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both [animation-delay:220ms]">
            {steps.map((step) => {
              const active = step.n === activeStep;
              return (
                <li
                  key={`${state}-${step.n}`}
                  className={
                    active
                      ? 'flex min-h-[88px] flex-1 flex-col justify-between rounded-2xl bg-white p-4 text-[#0a0a0c] shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-transform duration-300'
                      : 'flex min-h-[88px] flex-1 flex-col justify-between rounded-2xl border border-white/10 bg-black/25 p-4 text-white/45 backdrop-blur-sm'
                  }
                >
                  <span
                    className={
                      active
                        ? 'flex size-7 items-center justify-center rounded-full bg-[#0a0a0c] font-[family-name:var(--font-display)] text-xs font-semibold text-white'
                        : 'flex size-7 items-center justify-center rounded-full border border-white/20 font-[family-name:var(--font-display)] text-xs'
                    }
                  >
                    {step.n}
                  </span>
                  <span className="mt-3 text-sm font-medium leading-snug">{step.label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>

      {/* Right — form */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10">
        <p className="mb-8 font-[family-name:var(--font-display)] text-xs font-semibold tracking-[0.28em] text-white/50 lg:hidden">
          CALYX
        </p>
        <div
          key={state}
          className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          {state === 'signIn' ? <SignInCard setState={setState} /> : <SignUpCard setState={setState} />}
        </div>
      </main>
    </div>
  );
};
