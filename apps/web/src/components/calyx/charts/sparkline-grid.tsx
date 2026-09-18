'use client';

import { COLORS } from '../chart-registry';
import { MetricValue, MicroLabel, MiniBars, Subcard } from './chart-ui';

interface TimePoint {
  time: string;
  value: number;
}
interface TimeSeries {
  label: string;
  points: TimePoint[];
  color?: string;
}

/** Metric tiles + mini bars — Assets Under Management reference. */
export function SparklineGrid({ series }: { series: TimeSeries[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {series.map((s, i) => {
        const color = s.color ?? COLORS.series[i % COLORS.series.length];
        const values = s.points.map((p) => p.value);
        const latest = values[values.length - 1] ?? 0;
        const prev = values[values.length - 2] ?? latest;
        const delta = latest - prev;
        const labels = s.points.slice(-4).map((p) => p.time.replace(/.*\s/, '').slice(0, 3));

        return (
          <Subcard key={s.label} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <MicroLabel>{s.label}</MicroLabel>
              <div className="mt-1">
                <MetricValue size="md">{latest.toFixed(1)}</MetricValue>
              </div>
              <p
                className={`mt-1 text-[11px] tabular-nums ${
                  delta >= 0 ? 'text-[var(--sazabi-crimson)]' : 'text-[var(--sazabi-ok)]'
                }`}
              >
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(2)} vs prior
              </p>
            </div>
            <MiniBars values={values.slice(-4)} labels={labels} color={color} />
          </Subcard>
        );
      })}
    </div>
  );
}
