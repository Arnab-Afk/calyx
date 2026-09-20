import { differenceInMinutes, format, isToday, isYesterday } from 'date-fns';
import { Loader } from 'lucide-react';
import { useState } from 'react';

import { useCurrentMember } from '@/features/members/api/use-current-member';
import type { GetMessagesReturnType } from '@/features/messages/api/use-get-messages';
import { usePendingAsk } from '@/features/messages/store/use-pending-ask';
import { useWorkspaceId } from '@/hooks/use-workspace-id';

import { Id } from '../../convex/_generated/dataModel';
import { CalyxThinking } from './calyx/calyx-thinking';
import { ChannelHero } from './channel-hero';
import { ConversationHero } from './conversation-hero';
import { Message } from './message';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

const TIME_THRESHOLD = 5;

interface MessageListProps {
  memberName?: string;
  memberImage?: string;
  channelName?: string;
  channelCreationTime?: number;
  variant?: 'channel' | 'thread' | 'conversation';
  data: GetMessagesReturnType | undefined;
  loadMore: () => void;
  isLoadingMore: boolean;
  canLoadMore: boolean;
}

const formatDateLabel = (dateStr: string) => {
  const date = new Date(dateStr);

  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';

  return format(date, 'EEEE, MMMM d');
};

function quillPlainText(body: string) {
  try {
    const delta = JSON.parse(body);
    if (Array.isArray(delta?.ops)) {
      return delta.ops
        .map((op: { insert?: unknown }) => (typeof op.insert === 'string' ? op.insert : ''))
        .join('')
        .trim();
    }
  } catch {
    /* plain text */
  }
  return body.trim();
}

export const MessageList = ({
  memberName,
  memberImage,
  channelName,
  channelCreationTime,
  data,
  variant = 'channel',
  loadMore,
  isLoadingMore,
  canLoadMore,
}: MessageListProps) => {
  const [editingId, setEditingId] = useState<Id<'messages'> | null>(null);

  const workspaceId = useWorkspaceId();
  const [pendingAsk] = usePendingAsk();

  const { data: currentMember } = useCurrentMember({ workspaceId });

  const groupedMessages = data?.reduce(
    (groups, message) => {
      const date = new Date(message._creationTime);
      const dateKey = format(date, 'yyyy-MM-dd');

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }

      groups[dateKey].push(message);

      return groups;
    },
    {} as Record<string, typeof data>,
  );

  if (groupedMessages) {
    for (const key of Object.keys(groupedMessages)) {
      groupedMessages[key].sort((a, b) => {
        const byTime = a._creationTime - b._creationTime;
        if (byTime !== 0) return byTime;
        return Number(Boolean(a.calyxData)) - Number(Boolean(b.calyxData));
      });
    }
  }

  const pendingAlreadyListed = Boolean(
    pendingAsk &&
      data?.some((message) => !message.calyxData && quillPlainText(message.body) === pendingAsk),
  );
  const showPending = Boolean(pendingAsk) && !pendingAlreadyListed;

  return (
    <div className="messages-scrollbar flex flex-1 flex-col-reverse overflow-y-auto pb-4">
      {pendingAsk && <CalyxThinking className="pb-1" />}
      {showPending && currentMember && (
        <PendingOutgoing
          name={currentMember.user.name}
          image={currentMember.user.image}
          body={pendingAsk!}
        />
      )}
      {Object.entries(groupedMessages || {}).map(([dateKey, messages]) => (
        <div key={dateKey}>
          <div className="relative my-3 text-center">
            <hr className="absolute left-0 right-0 top-1/2 border-t border-white/10" />

            <span className="relative inline-block rounded-full border border-white/10 bg-black/50 px-4 py-1 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wider text-white/55 backdrop-blur-md">
              {formatDateLabel(dateKey)}
            </span>
          </div>

          {messages.map((message, i) => {
            const prevMessage = messages[i - 1];
            const isCompact =
              prevMessage &&
              prevMessage.user._id === message.user._id &&
              differenceInMinutes(new Date(message._creationTime), new Date(prevMessage._creationTime)) < TIME_THRESHOLD;

            return (
              <Message
                key={message._id}
                id={message._id}
                memberId={message.memberId}
                authorImage={message.user.image}
                authorName={message.user.name}
                isAuthor={message.memberId === currentMember?._id}
                reactions={message.reactions}
                body={message.body}
                image={message.image}
                updatedAt={message.updatedAt}
                createdAt={message._creationTime}
                threadCount={message.threadCount}
                threadImage={message.threadImage}
                threadName={message.threadName}
                threadTimestamp={message.threadTimestamp}
                isEditing={editingId === message._id}
                setEditingId={setEditingId}
                isCompact={isCompact}
                hideThreadButton={variant === 'thread'}
                calyxData={(message as { calyxData?: import('./calyx/calyx-message').CalyxData }).calyxData}
              />
            );
          })}
        </div>
      ))}

      <div
        className="h-1"
        ref={(el) => {
          if (el) {
            const observer = new IntersectionObserver(
              ([entry]) => {
                if (entry.isIntersecting && canLoadMore) loadMore();
              },
              { threshold: 1.0 },
            );

            observer.observe(el);

            return () => observer.disconnect();
          }
        }}
      />

      {isLoadingMore && (
        <div className="relative my-2 text-center">
          <hr className="absolute left-0 right-0 top-1/2 border-t border-white/10" />

          <span className="relative inline-block rounded-full border border-white/10 bg-black/50 px-4 py-1 text-xs backdrop-blur-md">
            <Loader className="size-4 animate-spin text-[var(--sazabi-crimson)]" />
          </span>
        </div>
      )}

      {variant === 'channel' && channelName && channelCreationTime && <ChannelHero name={channelName} creationTime={channelCreationTime} />}
      {variant === 'conversation' && <ConversationHero name={memberName} image={memberImage} />}
    </div>
  );
};

function PendingOutgoing({ name, image, body }: { name?: string; image?: string; body: string }) {
  const label = name || 'You';
  return (
    <div className="group relative flex flex-col gap-2 px-5 py-1.5">
      <div className="sazabi-glass sazabi-scanlines flex items-start gap-3 rounded-xl px-3.5 py-3">
        <Avatar className="size-9 rounded-md">
          <AvatarImage alt={label} src={image} className="sazabi-avatar rounded-md" />
          <AvatarFallback className="rounded-md bg-[var(--sazabi-crimson)]/30 font-[family-name:var(--font-display)] text-white">
            {label.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-white">{label}</span>
            <span className="text-[12px] text-white/40">Sending</span>
          </div>
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-white/90">{body}</p>
        </div>
      </div>
    </div>
  );
}
