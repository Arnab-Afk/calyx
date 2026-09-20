'use client';

import { Loader, LogOut, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useChatAuth } from '@/components/chat-auth-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface UserButtonProps {
  onOpenProfile?: () => void;
}

export const UserButton = ({ onOpenProfile }: UserButtonProps = {}) => {
  const router = useRouter();
  const chatAuth = useChatAuth();
  const data = chatAuth.user;
  const isLoading = chatAuth.isLoading;

  if (isLoading) {
    return <Loader className="size-4 animate-spin text-muted-foreground" />;
  }

  if (!data) {
    return null;
  }

  const { image, name } = data;
  const avatarFallback = name?.charAt(0).toUpperCase();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className="relative outline-none">
        <Avatar className="size-10 transition hover:opacity-75">
          <AvatarImage alt={name} src={image} />
          <AvatarFallback className="text-base">{avatarFallback}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="center" side="right" className="w-60">
        {onOpenProfile && (
          <DropdownMenuItem onClick={onOpenProfile} className="h-10">
            <UserRound className="mr-2 size-4" />
            Profile &amp; settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={async () => {
            await chatAuth.logout();
            router.replace('/auth');
          }}
          className="h-10"
        >
          <LogOut className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
