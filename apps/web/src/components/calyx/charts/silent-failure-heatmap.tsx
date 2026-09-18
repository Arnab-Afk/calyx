'use client';

import { Fragment } from 'react';
import { COLORS } from '../chart-registry';

export interface SilentFailureHeatmapData {
  endpoints: string[];
  hours: string[];
  cells: number[][];
}

function cellColor(v: number) {
  if (v <= 0.15) return COLORS.ok + '99';
  if (v <= 0.45) return COLORS.warn + 'bb';
  return COLORS.error + 'dd';
}

export function SilentFailureHeatmap({ data }: { data: SilentFailureHeatmapData }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="inline-grid gap-[3px]"
        style={{ gridTemplateColumns: `100px repeat(${data.hours.length}, minmax(28px, 1fr))` }}
      >
        <div />
        {data.hours.map((h) => (
          <div key={h} className="pb-1 text-center text-[9px] text-white/35">
            {h}
          </div>
        ))}
        {data.endpoints.map((ep, ri) => (
          <Fragment key={ep}>
            <div className="truncate pr-2 text-right text-[10px] text-white/55">{ep}</div>
            {data.cells[ri]?.map((v, ci) => (
              <div
                key={`${ep}-${ci}`}
                className="h-6 rounded-[3px]"
                style={{ backgroundColor: cellColor(v) }}
                title={`${ep} @ ${data.hours[ci]}: ${(v * 100).toFixed(0)}% silent-fail score`}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-[10px] text-white/40">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: COLORS.ok }} /> traffic OK
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: COLORS.warn }} /> degraded
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: COLORS.error }} /> silent failure
        </span>
      </div>
    </div>
  );
}
