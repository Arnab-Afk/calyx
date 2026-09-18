import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ConversationHeroProps {
  name?: string;
  image?: string;
}

export const ConversationHero = ({ name = 'Member', image }: ConversationHeroProps) => {
  const avatarFallback = name.charAt(0).toUpperCase();

  return (
    <div className="mx-5 mb-4 mt-[88px]">
      <div className="mb-2 flex items-center gap-x-1">
        <Avatar className="mr-2 size-14 rounded-md">
          <AvatarImage src={image} className="sazabi-avatar rounded-md" />
          <AvatarFallback className="rounded-md bg-[var(--sazabi-crimson)]/30 font-[family-name:var(--font-display)] text-white">
            {avatarFallback}
          </AvatarFallback>
        </Avatar>

        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-white">{name}</p>
      </div>

      <p className="mb-4 text-base font-normal text-white/55">
        This conversation is just between you and <strong className="text-white/80">{name}</strong>
      </p>
    </div>
  );
};
