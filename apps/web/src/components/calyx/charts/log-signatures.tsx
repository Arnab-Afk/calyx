'use client';

import { COLORS } from '../chart-registry';

export interface LogSignature {
  fingerprint: string;
  count: number;
  trend: number[]; // mini spark values
  sample: string;
}

export interface LogSignaturesData {
  signatures: LogSignature[];
}

function miniSpark(values: number[]) {
  const max = Math.max(...values, 1);
  return values.map((v, i) => {
    const h = Math.max(2, (v / max) * 18);
    const hot = i === values.length - 1 && v === max;
    return (
      <div
        key={i}
        className="w-1 rounded-sm"
        style={{ height: h, background: hot ? COLORS.error : COLORS.info + '99' }}
      />
    );
  });
}

/** Ranked exception fingerprints with mini trends. */
export function LogSignatures({ data }: { data: LogSignaturesData }) {
  const sorted = [...data.signatures].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-2">
      {sorted.map((s, i) => (
        <div
          key={s.fingerprint}
          className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2"
        >
          <span className="w-4 text-[11px] text-white/30">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <code className="rounded bg-[#2a2428] px-1.5 py-0.5 font-mono text-[11px] text-[#ffb0b8]">
              {s.fingerprint}
            </code>
            <p className="mt-0.5 truncate text-[10px] text-white/40">{s.sample}</p>
          </div>
          <div className="flex h-5 items-end gap-[2px]">{miniSpark(s.trend)}</div>
          <span className="w-10 text-right font-mono text-[11px] text-white/70">{s.count}</span>
        </div>
      ))}
    </div>
  );
}
