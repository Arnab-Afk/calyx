'use client';

import { Loader } from 'lucide-react';
import dynamic from 'next/dynamic';
import type Quill from 'quill';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Id } from '@/../convex/_generated/dataModel';
import { useCreateMessage } from '@/features/messages/api/use-create-message';
import { usePendingAsk } from '@/features/messages/store/use-pending-ask';
import { useChannelId } from '@/hooks/use-channel-id';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { chatApi, uploadChatImage } from '@/lib/chat-api';

const Editor = dynamic(() => import('@/components/editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface ChatInputProps {
  placeholder?: string;
}

type CreateMessageValues = {
  channelId: Id<'channels'>;
  workspaceId: Id<'workspaces'>;
  body: string;
  image?: Id<'_storage'>;
};

/** Extract plain text from a Quill delta JSON string. */
function quillBodyToText(body: string): string {
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

/** Strip optional /calyx prefix; every channel message can be an investigation. */
function calyxQueryFromText(plainText: string): string {
  return plainText.replace(/^\/calyx\s*/i, '').trim();
}

export const ChatInput = ({ placeholder }: ChatInputProps) => {
  const [isPending, setIsPending] = useState(false);
  const [isCalyxThinking, setIsCalyxThinking] = useState(false);

  const innerRef = useRef<Quill | null>(null);
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();

  const { mutate: createMessage } = useCreateMessage();
  const [, setPendingAsk] = usePendingAsk();

  const handleSubmit = async ({ body, image }: { body: string; image: File | null }) => {
    try {
      setIsPending(true);
      innerRef.current?.enable(false);

      const plainText = quillBodyToText(body);
      const query = calyxQueryFromText(plainText);

      // Text + optional image → Calyx agent (charts / tool-backed answers)
      if (query) {
        // Clear the composer in place — remounting via key looked like a page refresh.
        innerRef.current?.setContents([] as never);
        innerRef.current?.setText('');
        setPendingAsk(query);
        setIsCalyxThinking(true);
        await chatApi.askCalyx(String(channelId), query);
        return;
      }

      // Image-only (or empty text) stays on the normal message path
      if (!image) {
        toast.info('Type a question for Calyx, or attach an image.');
        return;
      }

      const values: CreateMessageValues = {
        channelId,
        workspaceId,
        body,
        image: undefined,
      };
      const upload = await uploadChatImage(String(workspaceId), image);
      values.image = upload.id as Id<'_storage'>;
      await createMessage(values, { throwError: true });
      innerRef.current?.setContents([] as never);
      innerRef.current?.setText('');
    } catch (error) {
      // Ask inserts the question immediately; the reply often lands via websocket even if
      // the long HTTP wait times out (browser "Failed to fetch"). Soft-refresh instead of
      // a scary toast when that happens.
      window.dispatchEvent(new Event('calyx:chat-mutated'));
      const detail = error instanceof Error && error.message ? error.message : 'Failed to send message.';
      if (/failed to fetch|networkerror|abort|timeout/i.test(detail)) {
        return;
      }
      toast.error(detail);
    } finally {
      setIsPending(false);
      setIsCalyxThinking(false);
      setPendingAsk(null);
      innerRef?.current?.enable(true);
    }
  };

  return (
    <div className="w-full">
      <div className="px-5">
        <Editor
          placeholder={placeholder ?? 'Ask Calyx about errors, deploys, logs…'}
          onSubmit={handleSubmit}
          disabled={isPending || isCalyxThinking}
          innerRef={innerRef}
        />
      </div>
    </div>
  );
};
