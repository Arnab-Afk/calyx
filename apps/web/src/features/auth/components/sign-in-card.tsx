'use client';

import { Eye, EyeOff, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FaGithub } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { chatApiUrl } from '@/lib/chat-api';
import { cn } from '@/lib/utils';

import type { SignInFlow } from '../types';

interface SignInCardProps {
  setState: (state: SignInFlow) => void;
}

export const SignInCard = ({ setState }: SignInCardProps) => {
  const router = useRouter();
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
      .then(() => router.replace('/'))
      .catch(() => {
        setError('Invalid email or password.');
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="w-full">
      <div className="mb-8 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-white">
          Sign In Account
        </h2>
        <p className="mt-2 text-sm text-white/50">Enter your credentials to access your workspace.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <SocialButton
          icon={<FcGoogle className="size-[18px]" />}
          label="Google"
          onClick={() => {
            window.location.href = `${chatApiUrl}/v1/auth/google`;
          }}
        />
        <SocialButton
          icon={<FaGithub className="size-[18px]" />}
          label="Github"
          onClick={() => {
            window.location.href = `${chatApiUrl}/v1/auth/github`;
          }}
        />
      </div>

      <Divider />

      {!!error && (
        <div className="mb-4 flex items-center gap-x-2 rounded-xl border border-[var(--sazabi-crimson)]/30 bg-[var(--sazabi-crimson)]/10 px-3 py-2.5 text-sm text-[#ff8a93]">
          <TriangleAlert className="size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSignIn} className="space-y-4">
        <Field label="Email">
          <Input
            disabled={pending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="eg. you@company.com"
            type="email"
            autoComplete="email"
            required
            className={fieldClass}
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <Input
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

        <Button
          type="submit"
          disabled={pending}
          className="mt-2 h-11 w-full rounded-xl bg-white text-base font-semibold text-[#0a0a0c] hover:bg-white/90"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-white/45">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          disabled={pending}
          onClick={() => setState('signUp')}
          className="font-semibold text-white underline-offset-4 hover:underline disabled:opacity-50"
        >
          Sign up
        </button>
      </p>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-white/55">{label}</span>
      {children}
    </label>
  );
}

function Divider() {
  return (
    <div className="relative mb-6">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/10" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-[var(--sazabi-void)] px-3 text-white/35">Or</span>
      </div>
    </div>
  );
}

function SocialButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? 'Coming soon' : undefined}
      className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#141416] text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-[#1a1a1e] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {icon}
      {label}
    </button>
  );
}

const fieldClass =
  'h-11 rounded-xl border-white/10 bg-[#141416] text-white placeholder:text-white/30 focus-visible:ring-[var(--sazabi-crimson)]/40';
