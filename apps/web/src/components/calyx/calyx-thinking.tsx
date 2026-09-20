'use client';

import { cn } from '@/lib/utils';

function CalyxMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/calyx-avatar.png"
      alt=""
      width={36}
      height={36}
      className={cn(
        'size-9 shrink-0 rounded-[6px] object-cover ring-1 ring-white/10',
        className,
      )}
    />
  );
}

/** Inline typing indicator that matches Calyx reply chrome. */
export function CalyxThinking({ className }: { className?: string }) {
  return (
    <div
      className={cn('pointer-events-none px-5 py-1.5', className)}
      role="status"
      aria-live="polite"
      aria-label="Calyx is investigating"
    >
      <div className="flex max-w-2xl items-start gap-3">
        <CalyxMark className="opacity-90" />
        <div className="min-w-0 pt-0.5">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-wide text-white">
              Calyx
            </span>
            <span className="rounded-[3px] bg-black/35 px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45 ring-1 ring-white/10">
              App
            </span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
            <span className="flex items-center gap-1" aria-hidden>
              <span className="size-1.5 animate-[calyx-dot_1.2s_ease-in-out_infinite] rounded-full bg-white/55" />
              <span className="size-1.5 animate-[calyx-dot_1.2s_ease-in-out_0.2s_infinite] rounded-full bg-white/55" />
              <span className="size-1.5 animate-[calyx-dot_1.2s_ease-in-out_0.4s_infinite] rounded-full bg-white/55" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[12px] tracking-wide text-white/45">
              Checking logs &amp; changes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
