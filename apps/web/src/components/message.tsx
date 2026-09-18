import { format, isToday, isYesterday } from 'date-fns';
import { Loader } from 'lucide-react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRemoveMessage } from '@/features/messages/api/use-remove-message';
import { useUpdateMessage } from '@/features/messages/api/use-update-message';
import { useToggleReaction } from '@/features/reactions/api/use-toggle-reaction';
import { useConfirm } from '@/hooks/use-confirm';
import { usePanel } from '@/hooks/use-panel';
import { cn } from '@/lib/utils';

import type { Doc, Id } from '../../convex/_generated/dataModel';
import { Hint } from './hint';
import { CalyxMessage, type CalyxData } from './calyx/calyx-message';
import { Reactions } from './reactions';
import { ThreadBar } from './thread-bar';
import { Thumbnail } from './thumbnail';
import { Toolbar } from './toolbar';

const Renderer = dynamic(() => import('./renderer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});
const Editor = dynamic(() => import('./editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface MessageProps {
  id: Id<'messages'>;
  memberId: Id<'members'>;
  authorName?: string;
  authorImage?: string;
  isAuthor: boolean;
  reactions: Array<
    Omit<Doc<'reactions'>, 'memberId'> & {
      count: number;
      memberIds: Id<'members'>[];
    }
  >;
  body: Doc<'messages'>['body'];
  image: string | null | undefined;
  createdAt: Doc<'messages'>['_creationTime'];
  updatedAt: Doc<'messages'>['updatedAt'];
  isEditing: boolean;
  isCompact?: boolean;
  setEditingId: (id: Id<'messages'> | null) => void;
  hideThreadButton?: boolean;
  threadCount?: number;
  threadImage?: string;
  threadName?: string;
  threadTimestamp?: number;
  calyxData?: CalyxData;
}

const formatFullTime = (date: Date) => {
  return `${isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'MMM d, yyyy')} at ${format(date, 'h:mm:ss a')}`;
};

export const Message = ({
  id,
  isAuthor,
  body,
  createdAt,
  image,
  isEditing,
  authorName = 'Member',
  authorImage,
  memberId,
  reactions,
  setEditingId,
  updatedAt,
  hideThreadButton,
  isCompact,
  threadCount,
  threadImage,
  threadName,
  threadTimestamp,
  calyxData,
}: MessageProps) => {
  const [ConfirmDialog, confirm] = useConfirm('Delete message', 'Are you sure you want to delete this message? This cannot be undone.');
  const { parentMessageId, onOpenMessage, onOpenProfile, onClose } = usePanel();

  const { mutate: updateMessage, isPending: isUpdatingMessage } = useUpdateMessage();
  const { mutate: removeMessage, isPending: isRemovingMessage } = useRemoveMessage();
  const { mutate: toggleReaction, isPending: isTogglingReaction } = useToggleReaction();

  const avatarFallback = authorName.charAt(0).toUpperCase();
  const isPending = isUpdatingMessage || isRemovingMessage || isTogglingReaction;

  const handleUpdate = ({ body }: { body: string }) => {
    updateMessage(
      { id, body },
      {
        onSuccess: () => {
          toast.success('Message updated.');
          setEditingId(null);
        },
        onError: () => {
          toast.error('Failed to update message.');
        },
      },
    );
  };

  const handleDelete = async () => {
    const ok = await confirm();

    if (!ok) return;

    removeMessage(
      { id },
      {
        onSuccess: () => {
          toast.success('Message deleted.');

          if (parentMessageId === id) onClose();
        },
        onError: () => {
          toast.error('Failed to delete message.');
        },
      },
    );
  };

  const handleReaction = async (value: string) => {
    toggleReaction(
      { messageId: id, value },
      {
        onError: () => {
          toast.error('Failed to toggle reaction.');
        },
      },
    );
  };

  if (calyxData && !isEditing) {
    return (
      <>
        <ConfirmDialog />
        <div
          className={cn(
            'group relative px-5 py-1.5',
            isRemovingMessage && 'origin-bottom scale-y-0 transform bg-rose-500/20 transition-all duration-200',
          )}
        >
          <CalyxMessage data={calyxData} createdAt={createdAt} />
          <div className="max-w-2xl pl-1">
            <Reactions data={reactions} onChange={handleReaction} />
            <ThreadBar
              count={threadCount}
              image={threadImage}
              name={threadName}
              timestamp={threadTimestamp}
              onClick={() => onOpenMessage(id)}
            />
          </div>
          <Toolbar
            isAuthor={isAuthor}
            isPending={isPending}
            handleEdit={() => setEditingId(id)}
            handleThread={() => onOpenMessage(id)}
            handleDelete={handleDelete}
            handleReaction={handleReaction}
            hideThreadButton={hideThreadButton}
          />
        </div>
      </>
    );
  }

  if (isCompact) {
    return (
      <>
        <ConfirmDialog />

        <div
          className={cn(
            'group relative flex flex-col gap-2 px-5 py-1',
            isEditing && 'rounded-lg bg-[var(--sazabi-crimson)]/10',
            isRemovingMessage && 'origin-bottom scale-y-0 transform bg-rose-500/20 transition-all duration-200',
          )}
        >
          <div className="flex items-start gap-3">
            <Hint label={formatFullTime(new Date(createdAt))}>
              <button className="w-10 pt-2 text-center text-[11px] leading-none text-white/30 opacity-0 transition group-hover:opacity-100 hover:text-white/60 hover:underline">
                {format(new Date(createdAt), 'h:mm')}
              </button>
            </Hint>

            {isEditing ? (
              <div className="size-full">
                <Editor
                  onSubmit={handleUpdate}
                  disabled={isPending}
                  defaultValue={JSON.parse(body)}
                  onCancel={() => setEditingId(null)}
                  variant="update"
                />
              </div>
            ) : (
              <div className="sazabi-glass sazabi-scanlines min-w-0 flex-1 rounded-xl px-3.5 py-2.5">
                <Renderer value={body} />
                <Thumbnail url={image} />
                {updatedAt ? <span className="text-xs text-white/35">(edited)</span> : null}
                <Reactions data={reactions} onChange={handleReaction} />
                <ThreadBar
                  count={threadCount}
                  image={threadImage}
                  name={threadName}
                  timestamp={threadTimestamp}
                  onClick={() => onOpenMessage(id)}
                />
              </div>
            )}
          </div>

          {!isEditing && (
            <Toolbar
              isAuthor={isAuthor}
              isPending={isPending}
              handleEdit={() => setEditingId(id)}
              handleThread={() => onOpenMessage(id)}
              handleDelete={handleDelete}
              handleReaction={handleReaction}
              hideThreadButton={hideThreadButton}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <ConfirmDialog />

      <div
        className={cn(
          'group relative flex flex-col gap-2 px-5 py-1.5',
          isEditing && 'rounded-lg bg-[var(--sazabi-crimson)]/10',
          isRemovingMessage && 'origin-bottom scale-y-0 transform bg-rose-500/20 transition-all duration-200',
        )}
      >
        {isEditing ? (
          <div className="size-full pl-12">
            <Editor
              onSubmit={handleUpdate}
              disabled={isPending}
              defaultValue={JSON.parse(body)}
              onCancel={() => setEditingId(null)}
              variant="update"
            />
          </div>
        ) : (
          <div className="sazabi-glass sazabi-scanlines flex items-start gap-3 rounded-xl px-3.5 py-3">
            <button onClick={() => onOpenProfile(memberId)} className="shrink-0">
              <Avatar className="size-9 rounded-md">
                <AvatarImage alt={authorName} src={authorImage} className="sazabi-avatar rounded-md" />
                <AvatarFallback className="rounded-md bg-[var(--sazabi-crimson)]/30 font-[family-name:var(--font-display)] text-white">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
            </button>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="mb-1 flex items-baseline gap-2">
                <button
                  onClick={() => onOpenProfile(memberId)}
                  className="font-[family-name:var(--font-display)] text-[14px] font-semibold text-white hover:underline"
                >
                  {authorName}
                </button>
                <Hint label={formatFullTime(new Date(createdAt))}>
                  <button className="text-[12px] text-white/40 hover:underline">
                    {format(new Date(createdAt), 'h:mm a')}
                  </button>
                </Hint>
              </div>

              <Renderer value={body} />
              <Thumbnail url={image} />
              {updatedAt ? <span className="text-xs text-white/35">(edited)</span> : null}
              <Reactions data={reactions} onChange={handleReaction} />
              <ThreadBar
                count={threadCount}
                image={threadImage}
                name={threadName}
                timestamp={threadTimestamp}
                onClick={() => onOpenMessage(id)}
              />
            </div>
          </div>
        )}

        {!isEditing && (
          <Toolbar
            isAuthor={isAuthor}
            isPending={isPending}
            handleEdit={() => setEditingId(id)}
            handleThread={() => onOpenMessage(id)}
            handleDelete={handleDelete}
            handleReaction={handleReaction}
            hideThreadButton={hideThreadButton}
          />
        )}
      </div>
    </>
  );
};
