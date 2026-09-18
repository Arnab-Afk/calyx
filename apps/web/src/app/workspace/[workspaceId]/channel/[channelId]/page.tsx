'use client';

import { Loader, TriangleAlert } from 'lucide-react';

import { MessageList } from '@/components/message-list';
import { useGetChannel } from '@/features/channels/api/use-get-channel';
import { useGetMessages } from '@/features/messages/api/use-get-messages';
import { useChannelId } from '@/hooks/use-channel-id';

import { ChatInput } from './chat-input';
import { Header } from './header';

const ChannelIdPage = () => {
  const channelId = useChannelId();

  const { results, status, loadMore } = useGetMessages({ channelId });
  const { data: channel, isLoading: channelLoading } = useGetChannel({ id: channelId });

  if (channelLoading || status == 'LoadingFirstPage') {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-transparent">
        <Loader className="size-5 animate-spin text-[var(--sazabi-crimson)]" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-y-2 bg-transparent">
        <TriangleAlert className="size-5 text-[var(--sazabi-crimson)]" />
        <span className="text-sm text-white/50">Channel not found.</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 80% 10%, rgba(180,30,45,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 10% 90%, rgba(30,50,90,0.3), transparent 50%)',
        }}
      />
      <div className="relative flex h-full flex-col">
        <Header channelName={channel.name} />

        <MessageList
          channelName={channel.name}
          channelCreationTime={channel._creationTime}
          data={results}
          loadMore={loadMore}
          isLoadingMore={status === 'LoadingMore'}
          canLoadMore={status === 'CanLoadMore'}
        />

        <div className="relative z-[1] px-0 pb-1">
          <ChatInput placeholder={`Message # ${channel.name}`} />
        </div>
      </div>
    </div>
  );
};

export default ChannelIdPage;
