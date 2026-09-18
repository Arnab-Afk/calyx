import { MessageSquareText, Pencil, Smile, Trash } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { EmojiPopover } from './emoji-popover';
import { Hint } from './hint';

interface ToolbarProps {
  isAuthor: boolean;
  isPending: boolean;
  handleEdit: () => void;
  handleDelete: () => void;
  handleThread: () => void;
  handleReaction: (value: string) => void;
  hideThreadButton?: boolean;
}

export const Toolbar = ({
  isAuthor,
  isPending,
  handleEdit,
  handleDelete,
  handleThread,
  handleReaction,
  hideThreadButton,
}: ToolbarProps) => {
  return (
    <div className="absolute right-5 top-0">
      <div className="sazabi-glass rounded-lg border border-white/10 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        <EmojiPopover hint="Add reaction" onEmojiSelect={handleReaction}>
          <Button variant="ghost" size="iconSm" disabled={isPending} className="text-white/60 hover:bg-white/5 hover:text-white">
            <Smile className="size-4" />
          </Button>
        </EmojiPopover>

        {!hideThreadButton && (
          <Hint label="Reply in thread">
            <Button
              onClick={handleThread}
              variant="ghost"
              size="iconSm"
              disabled={isPending}
              className="text-white/60 hover:bg-white/5 hover:text-white"
            >
              <MessageSquareText className="size-4" />
            </Button>
          </Hint>
        )}

        {isAuthor && (
          <Hint label="Edit message">
            <Button
              onClick={handleEdit}
              variant="ghost"
              size="iconSm"
              disabled={isPending}
              className="text-white/60 hover:bg-white/5 hover:text-white"
            >
              <Pencil className="size-4" />
            </Button>
          </Hint>
        )}

        {isAuthor && (
          <Hint label="Delete message">
            <Button
              onClick={handleDelete}
              variant="ghost"
              size="iconSm"
              disabled={isPending}
              className="text-white/60 hover:bg-white/5 hover:text-[var(--sazabi-crimson)]"
            >
              <Trash className="size-4" />
            </Button>
          </Hint>
        )}
      </div>
    </div>
  );
};
