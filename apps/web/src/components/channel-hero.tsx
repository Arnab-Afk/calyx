import { format } from 'date-fns';

interface ChannelHeroProps {
  name: string;
  creationTime: number;
}

export const ChannelHero = ({ name, creationTime }: ChannelHeroProps) => {
  return (
    <div className="mx-5 mb-4 mt-[88px]">
      <p className="mb-2 flex items-center font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-white">
        # {name}
      </p>

      <p className="mb-4 max-w-xl text-base font-normal text-white/55">
        This channel was created on {format(new Date(creationTime), 'MMMM do, yyyy')}. This is the very beginning of the{' '}
        <strong className="text-white/80">{name}</strong> channel.
      </p>
    </div>
  );
};
