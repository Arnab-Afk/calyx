import Quill from 'quill';
import { useEffect, useRef, useState } from 'react';

interface RendererProps {
  value: string;
}

function toQuillContents(value: string): { ops: Array<{ insert: string }> } {
  try {
    const parsed = JSON.parse(value) as { ops?: unknown };
    if (parsed && Array.isArray(parsed.ops)) return parsed as { ops: Array<{ insert: string }> };
  } catch {
    /* plain text from older Calyx asks */
  }
  const text = value.endsWith('\n') ? value : `${value}\n`;
  return { ops: [{ insert: text || '\n' }] };
}

const Renderer = ({ value }: RendererProps) => {
  const [isEmpty, setIsEmpty] = useState(false);
  const rendererRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rendererRef.current) return;

    const container = rendererRef.current;

    const quill = new Quill(document.createElement('div'), {
      theme: 'snow',
    });

    quill.enable(false);
    quill.setContents(toQuillContents(value) as never);

    const empty =
      quill
        .getText()
        .replace(/<(.|\n)*?>/g, '')
        .trim().length === 0;

    setIsEmpty(empty);
    container.innerHTML = quill.root.innerHTML;

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [value]);

  if (isEmpty) return null;

  return <div ref={rendererRef} className="ql-editor ql-renderer" />;
};

export default Renderer;
