'use client';

import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { FaGithub } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Input } from '@/components/ui/input';
import { chatApiUrl } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

import type { SignInFlow } from '../types';
import { Divider, Field, SocialButton, fieldClass } from './auth-ui';

function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

interface SignInCardProps {
  setState: (state: SignInFlow) => void;
}

export const SignInCard = ({ setState }: SignInCardProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNextPath(searchParams.get('next'));
  const chatAuth = useChatAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError('');

    chatAuth
      .login({ email, password })
      .then(() => router.replace(nextPath))
      .catch(() => {
        setError('Invalid email or password.');
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-white">
          Sign in
        </h2>
        <p className="mt-2 text-[15px] text-white/50">Enter your credentials to open your workspace.</p>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <SocialButton
          icon={<FcGoogle className="size-[18px]" />}
          label="Continue with Google"
          disabled={pending}
          onClick={() => {
            window.location.href = `${chatApiUrl}/v1/auth/google`;
          }}
        />
        <SocialButton
          icon={<FaGithub className="size-[18px]" />}
          label="Continue with GitHub"
          disabled={pending}
          onClick={() => {
            window.location.href = `${chatApiUrl}/v1/auth/github`;
          }}
        />
      </div>

      <Divider />

      {error ? (
        <div className="mb-4 flex items-center gap-x-2 rounded-lg border border-[var(--sazabi-crimson)]/30 bg-[var(--sazabi-crimson)]/10 px-3 py-2.5 text-sm text-[#ff8a93]">
          <TriangleAlert className="size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <form onSubmit={handleSignIn} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="signin-email">
          <Input
            id="signin-email"
            disabled={pending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
          />
        </Field>

        <Field label="Password" htmlFor="signin-password">
          <div className="relative">
            <Input
              id="signin-password"
              disabled={pending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className={cn(fieldClass, 'pr-11')}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white/70"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-12 w-full rounded-lg bg-[var(--sazabi-crimson)] text-sm font-semibold text-white shadow-[0_8px_24px_var(--sazabi-crimson-glow)] transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sazabi-crimson)] disabled:opacity-55"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-[13px] text-white/50">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          disabled={pending}
          onClick={() => setState('signUp')}
          className="font-semibold text-white hover:underline disabled:opacity-50"
        >
          Sign up
        </button>
      </p>
    </div>
  );
};
