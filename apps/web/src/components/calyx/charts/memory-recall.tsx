'use client';

export interface MemoryRecallData {
  incidentId: string;
  title: string;
  when: string;
  similarity: number;
  summary: string;
}

/** “Looks like #inc-482” memory thumbnail. */
export function MemoryRecall({ data }: { data: MemoryRecallData }) {
  return (
    <button
      type="button"
      className="flex w-full items-start gap-3 rounded-lg border border-white/10 bg-gradient-to-br from-[rgba(90,20,40,0.4)] to-black/40 p-3 text-left transition hover:border-[var(--sazabi-crimson)]/40"
    >
      <div className="flex size-12 shrink-0 flex-col justify-end gap-0.5 rounded-md bg-black/50 p-1.5">
        {[40, 70, 55, 90, 45].map((h, i) => (
          <div
            key={i}
            className="w-full rounded-[1px] bg-[var(--sazabi-crimson)]/70"
            style={{ height: `${h / 8}px` }}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--sazabi-mention)]">{data.incidentId}</span>
          <span className="text-[10px] text-white/35">{data.when}</span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">
            {(data.similarity * 100).toFixed(0)}% similar
          </span>
        </div>
        <p className="mt-0.5 font-[family-name:var(--font-display)] text-[13px] font-medium text-white">
          {data.title}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] text-white/45">{data.summary}</p>
      </div>
    </button>
  );
}
