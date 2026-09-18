'use client';

import { useState } from 'react';
import { COLORS } from '../chart-registry';

export interface BlastNode {
  id: string;
  label: string;
  severity: number; // 0–1
  x: number; // 0–100
  y: number;
}

export interface BlastEdge {
  from: string;
  to: string;
  weight: number; // 0–1 correlation
}

export interface BlastRadiusData {
  nodes: BlastNode[];
  edges: BlastEdge[];
}

/** Service graph with correlation glow — click a node to focus. */
export function BlastRadius({
  data,
  onFocus,
  cursors,
}: {
  data: BlastRadiusData;
  onFocus?: (id: string) => void;
  cursors?: Array<{ name: string; x: number; y: number; color: string }>;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const byId = Object.fromEntries(data.nodes.map((n) => [n.id, n]));

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-white/5 bg-black/30">
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {data.edges.map((e) => {
          const a = byId[e.from];
          const b = byId[e.to];
          if (!a || !b) return null;
          const dim = focus && focus !== e.from && focus !== e.to;
          return (
            <line
              key={`${e.from}-${e.to}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={COLORS.error}
              strokeOpacity={dim ? 0.08 : 0.15 + e.weight * 0.7}
              strokeWidth={0.4 + e.weight * 1.2}
            />
          );
        })}
        {data.nodes.map((n) => {
          const dim = focus && focus !== n.id;
          const r = 3.2 + n.severity * 2.5;
          return (
            <g
              key={n.id}
              className="cursor-pointer"
              onClick={() => {
                setFocus(n.id);
                onFocus?.(n.id);
              }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r + 1.5}
                fill={COLORS.error}
                fillOpacity={dim ? 0.05 : 0.15 + n.severity * 0.35}
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={n.severity > 0.6 ? COLORS.error : n.severity > 0.3 ? COLORS.warn : COLORS.ok}
                fillOpacity={dim ? 0.25 : 0.95}
                stroke="#fff"
                strokeOpacity={0.2}
                strokeWidth={0.3}
              />
              <text
                x={n.x}
                y={n.y + r + 4}
                textAnchor="middle"
                fill={dim ? '#666' : COLORS.text}
                fontSize="3.2"
                fontFamily="var(--font-display)"
              >
                {n.label}
              </text>
            </g>
          );
        })}
        {cursors?.map((c) => (
          <g key={c.name}>
            <circle cx={c.x} cy={c.y} r={1.2} fill={c.color} />
            <text x={c.x + 2} y={c.y - 1.5} fill={c.color} fontSize="2.4">
              {c.name}
            </text>
          </g>
        ))}
      </svg>
      {focus && (
        <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white/70">
          Focus: <span className="text-[var(--sazabi-mention)]">@{focus}</span>
          <button type="button" className="ml-2 text-white/40 hover:text-white" onClick={() => setFocus(null)}>
            clear
          </button>
        </div>
      )}
    </div>
  );
}
