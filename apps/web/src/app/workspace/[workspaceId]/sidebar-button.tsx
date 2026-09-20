import type { LucideIcon } from 'lucide-react';
import type { IconType } from 'react-icons/lib';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarButtonProps {
  icon: LucideIcon | IconType;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}

export const SidebarButton = ({ icon: Icon, label, isActive = false, onClick }: SidebarButtonProps) => {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="group flex cursor-pointer flex-col items-center justify-center gap-y-0.5"
    >
      <Button variant="transparent" className={cn('size-9 p-2 group-hover:bg-accent/20', isActive && 'bg-accent/20')}>
        <Icon className="size-5 text-white transition-all group-hover:scale-110" />
      </Button>

      <span className="text-[11px] text-white group-hover:text-accent">{label}</span>
    </div>
  );
};
