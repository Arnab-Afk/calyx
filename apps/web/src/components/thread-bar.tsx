import { formatDistanceToNow } from 'date-fns';
import { ChevronRight } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ThreadBarProps {
  count?: number;
  image?: string;
  name?: string;
  timestamp?: number;
  onClick?: () => void;
}

export const ThreadBar = ({ count, image, name = 'Member', timestamp, onClick }: ThreadBarProps) => {
  const avatarFallback = name.charAt(0).toUpperCase();

  if (!count || !timestamp) return null;

  return (
    <button
      onClick={onClick}
      className="group/thread-bar mt-1 flex max-w-[600px] items-center justify-start rounded-md border border-transparent p-1 transition hover:border-white/10 hover:bg-white/5"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <Avatar className="size-6 shrink-0 rounded-md">
          <AvatarImage src={image} className="sazabi-avatar rounded-md" />
          <AvatarFallback className="rounded-md bg-[var(--sazabi-crimson)]/30 text-white">{avatarFallback}</AvatarFallback>
        </Avatar>

        <span className="truncate text-xs font-bold text-[var(--sazabi-mention)] hover:underline">
          {count} {count > 1 ? 'replies' : 'reply'}
        </span>

        <span className="block truncate text-xs text-white/40 group-hover/thread-bar:hidden">
          Last reply {formatDistanceToNow(timestamp, { addSuffix: true })}
        </span>

        <span className="hidden truncate text-xs text-white/40 group-hover/thread-bar:block">View thread</span>
      </div>

      <ChevronRight className="ml-auto size-4 shrink-0 text-white/30 opacity-0 transition group-hover/thread-bar:opacity-100" />
    </button>
  );
};
