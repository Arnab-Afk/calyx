'use client';

import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FaGithub } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Input } from '@/components/ui/input';
import { chatApiUrl } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

import type { SignInFlow } from '../types';
import { Divider, Field, SocialButton, fieldClass } from './auth-ui';

interface SignUpCardProps {
  setState: (state: SignInFlow) => void;
}

export const SignUpCard = ({ setState }: SignUpCardProps) => {
  const router = useRouter();
  const chatAuth = useChatAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleSignUp = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (name.trim().length < 3) return setError('Name must be at least 3 characters.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setPending(true);
    setError('');
    chatAuth
      .register({ name: name.trim(), email, password })
      .then(() => router.replace('/'))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-white">
          Create your account
        </h2>
        <p className="mt-2 text-[15px] text-white/50">Set up your ops workspace in a minute.</p>
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

      <form onSubmit={handleSignUp} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="signup-name">
          <Input
            id="signup-name"
            disabled={pending}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            autoComplete="name"
            required
            className={fieldClass}
          />
        </Field>

        <Field label="Email" htmlFor="signup-email">
          <Input
            id="signup-email"
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

        <Field label="Password" htmlFor="signup-password">
          <div className="relative">
            <Input
              id="signup-password"
              disabled={pending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
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
          <p className="text-xs text-white/40">Must be at least 8 characters.</p>
        </Field>

        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-12 w-full rounded-lg bg-[var(--sazabi-crimson)] text-sm font-semibold text-white shadow-[0_8px_24px_var(--sazabi-crimson-glow)] transition hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sazabi-crimson)] disabled:opacity-55"
        >
          {pending ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p className="mt-6 text-[13px] text-white/50">
        Already have an account?{' '}
        <button
          type="button"
          disabled={pending}
          onClick={() => setState('signIn')}
          className="font-semibold text-white hover:underline disabled:opacity-50"
        >
          Log in
        </button>
      </p>
    </div>
  );
};
