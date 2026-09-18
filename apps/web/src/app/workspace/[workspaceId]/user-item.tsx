import { type VariantProps, cva } from 'class-variance-authority';
import Link from 'next/link';

import type { Id } from '@/../convex/_generated/dataModel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { cn } from '@/lib/utils';

const userItemVariants = cva('flex items-center gap-1.5 justify-start font-normal h-7 px-4 text-sm overflow-hidden', {
  variants: {
    variant: {
      default: 'text-white/70 hover:text-white hover:bg-white/5',
      active: 'text-white bg-[var(--sazabi-crimson)]/20 hover:bg-[var(--sazabi-crimson)]/25 border border-[var(--sazabi-crimson)]/30',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

interface UserItemProps {
  id: Id<'members'>;
  label?: string;
  image?: string;
  variant?: VariantProps<typeof userItemVariants>['variant'];
}

export const UserItem = ({ id, label = 'Member', image, variant }: UserItemProps) => {
  const workspaceId = useWorkspaceId();
  const avatarFallback = label.charAt(0).toUpperCase();

  return (
    <Button variant="transparent" className={cn(userItemVariants({ variant }))} size="sm" asChild>
      <Link href={`/workspace/${workspaceId}/member/${id}`}>
        <Avatar className="mr-1 size-5">
          <AvatarImage alt={label} src={image} />

          <AvatarFallback className="text-xs">{avatarFallback}</AvatarFallback>
        </Avatar>

        <span className="truncate text-sm">{label}</span>
      </Link>
    </Button>
  );
};
