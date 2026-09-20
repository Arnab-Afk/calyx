import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import type { SignInFlow } from '../types';

interface SignInCardProps {
  setState: (state: SignInFlow) => void;
}

export const SignInCard = ({ setState }: SignInCardProps) => {
  const router = useRouter();
  const chatAuth = useChatAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        setError('Invalid email or password!');
      })
      .finally(() => setPending(false));
  };

  return (
    <Card className="size-full p-8">
      <CardHeader className="px-0 pt-0">
        <CardTitle>Login to continue</CardTitle>
        <CardDescription>Use your Calyx email and password to continue.</CardDescription>
      </CardHeader>

      {!!error && (
        <div className="mb-6 flex items-center gap-x-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          <TriangleAlert className="size-4" />
          <p>{error}</p>
        </div>
      )}

      <CardContent className="space-y-5 px-0 pb-0">
        <form onSubmit={handleSignIn} className="space-y-2.5">
          <Input disabled={pending} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required />

          <Input
            disabled={pending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            required
          />

          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            Continue
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <button
            disabled={pending}
            onClick={() => setState('signUp')}
            className="cursor-pointer font-medium text-sky-700 hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            Sign up
          </button>
        </p>
      </CardContent>
    </Card>
  );
};
