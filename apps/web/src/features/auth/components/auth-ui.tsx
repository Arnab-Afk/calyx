'use client';

import { cn } from '@/lib/utils';

export const fieldClass =
  'h-12 rounded-lg border-white/10 bg-[#141416] px-4 text-[14px] text-white placeholder:text-white/35 focus-visible:border-[var(--sazabi-crimson)] focus-visible:ring-1 focus-visible:ring-[var(--sazabi-crimson)]';

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-white">{label}</span>
      {children}
    </label>
  );
}

export function Divider() {
  return (
    <div className="relative mb-6 flex items-center">
      <div className="grow border-t border-white/10" />
      <span className="px-4 text-[13px] text-white/40">or</span>
      <div className="grow border-t border-white/10" />
    </div>
  );
}

export function SocialButton({
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
      className={cn(
        'flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-[#141416] text-sm font-medium text-white/85 transition',
        'hover:border-white/20 hover:bg-[#1a1a1e] active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sazabi-crimson)]/50',
        'disabled:cursor-not-allowed disabled:opacity-55',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
