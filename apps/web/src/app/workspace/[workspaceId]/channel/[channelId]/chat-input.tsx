'use client';

import { Loader } from 'lucide-react';
import dynamic from 'next/dynamic';
import type Quill from 'quill';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Bot } from 'lucide-react';

import type { Id } from '@/../convex/_generated/dataModel';
import { useCreateMessage } from '@/features/messages/api/use-create-message';
import { useGenerateUploadUrl } from '@/features/upload/api/use-generate-upload-url';
import { useChannelId } from '@/hooks/use-channel-id';
import { useWorkspaceId } from '@/hooks/use-workspace-id';
import { useCalyxAsk } from '@/components/calyx/use-calyx-ask';

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
  calyxData?: {
    query: string;
    answer: string;
    chartType?: string;
    chartData?: string;
    toolNames: string[];
    tenantId: string;
  };
};

// Extract plain text from a Quill delta JSON string
function quillBodyToText(body: string): string {
  try {
    const delta = JSON.parse(body);
    if (Array.isArray(delta?.ops)) {
      return delta.ops.map((op: { insert?: unknown }) =>
        typeof op.insert === 'string' ? op.insert : ''
      ).join('').trim();
    }
  } catch {}
  return body.trim();
}

const TENANT_ID = process.env.NEXT_PUBLIC_CALYX_TENANT_ID ?? 'default';

export const ChatInput = ({ placeholder }: ChatInputProps) => {
  const [editorKey, setEditorKey] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [isCalyxThinking, setIsCalyxThinking] = useState(false);

  const innerRef = useRef<Quill | null>(null);
  const workspaceId = useWorkspaceId();
  const channelId = useChannelId();

  const { mutate: createMessage } = useCreateMessage();
  const { mutate: generateUploadUrl } = useGenerateUploadUrl();
  const { ask, buildCalyxData } = useCalyxAsk(TENANT_ID);

  const handleSubmit = async ({ body, image }: { body: string; image: File | null }) => {
    try {
      setIsPending(true);
      innerRef.current?.enable(false);

      const plainText = quillBodyToText(body);

      // /calyx <question> → run through AI agent
      if (plainText.startsWith('/calyx ') || plainText.toLowerCase() === '/calyx') {
        const query = plainText.replace(/^\/calyx\s*/i, '').trim();
        if (!query) {
          toast.info('Usage: /calyx <your question about the system>');
          setEditorKey((k) => k + 1);
          return;
        }

        // Post user's question first
        await createMessage(
          { channelId, workspaceId, body },
          { throwError: true }
        );
        setEditorKey((k) => k + 1);

        // Now run the agent (show thinking indicator)
        setIsCalyxThinking(true);
        const result = await ask(query);
        setIsCalyxThinking(false);

        if (!result) {
          toast.error('Calyx could not answer that question. Is the Calyx server running?');
          return;
        }

        const calyxData = buildCalyxData(query, result);

        // Post the Calyx bot response as a special message
        // body is a minimal Quill delta so it renders gracefully if calyxData is stripped
        const botBody = JSON.stringify({
          ops: [{ insert: `[Calyx] ${calyxData.answer.slice(0, 200)}${calyxData.answer.length > 200 ? '…' : ''}` }],
        });

        await createMessage(
          {
            channelId,
            workspaceId,
            body: botBody,
            calyxData,
          } as CreateMessageValues,
          { throwError: true }
        );
        return;
      }

      // Normal message path
      const values: CreateMessageValues = {
        channelId,
        workspaceId,
        body,
        image: undefined,
      };

      if (image) {
        const url = await generateUploadUrl({}, { throwError: true });
        if (!url) throw new Error('URL not found.');

        const result = await fetch(url, {
          method: 'POST',
          headers: { 'Content-type': image.type },
          body: image,
        });

        if (!result.ok) throw new Error('Failed to upload image.');
        const { storageId } = await result.json();
        values.image = storageId;
      }

      await createMessage(values, { throwError: true });
      setEditorKey((k) => k + 1);
    } catch (error) {
      toast.error('Failed to send message.');
    } finally {
      setIsPending(false);
      innerRef?.current?.enable(true);
    }
  };

  return (
    <div className="w-full px-5">
      {isCalyxThinking && (
        <div className="sazabi-glass mb-2 flex items-center gap-2 rounded-xl border border-[var(--sazabi-border)] px-3 py-2 text-sm text-[var(--sazabi-mention)]">
          <Bot className="size-4 animate-pulse text-[var(--sazabi-crimson)]" />
          Calyx is thinking…
        </div>
      )}
      <Editor
        placeholder={placeholder ?? 'Message or /calyx <question>'}
        key={editorKey}
        onSubmit={handleSubmit}
        disabled={isPending || isCalyxThinking}
        innerRef={innerRef}
      />
    </div>
  );
};
