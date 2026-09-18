'use client';

const BAR_WIDTH = 20;
const SPARK_CHARS = '▁▂▃▄▅▆▇█';

function progressBar(fraction: number) {
  const filled = Math.round(Math.min(fraction, 1) * BAR_WIDTH);
  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
}

function statusEmoji(rate: number) {
  if (rate >= 20) return '🔴';
  if (rate >= 10) return '🟠';
  if (rate >= 5) return '🟡';
  return '🟢';
}

export function sparkline(values: number[]) {
  if (!values.length) return '';
  const max = Math.max(...values, 0.001);
  return values.map((v) => SPARK_CHARS[Math.min(7, Math.floor((v / max) * 7))]).join('');
}

interface Service { service: string; errorRate: number; total: number; errorCount: number; }

export function TextStatusBars({ services }: { services: Service[] }) {
  const sorted = [...services].sort((a, b) => b.errorRate - a.errorRate);
  const totalEvents = sorted.reduce((s, x) => s + x.total, 0);
  const totalErrors = sorted.reduce((s, x) => s + x.errorCount, 0);
  const overallRate = totalEvents > 0 ? (totalErrors / totalEvents) * 100 : 0;

  return (
    <div className="rounded-lg border border-[#222529] bg-[#1a1d21] p-4 font-mono text-sm">
      <div className="mb-3 flex items-center gap-2 border-b border-[#222529] pb-3">
        <span className="text-base">{statusEmoji(overallRate)}</span>
        <span className="font-bold text-white">System Health — {sorted.length} services</span>
        <span className="ml-auto text-[#9b9ea4]">{overallRate.toFixed(1)}% overall error rate</span>
      </div>

      <div className="space-y-2">
        {sorted.map((svc) => (
          <div key={svc.service}>
            <div className="flex items-center gap-2 text-xs">
              <span>{statusEmoji(svc.errorRate)}</span>
              <span className="w-32 truncate font-semibold text-white">{svc.service}</span>
              <code className="text-[#9b9ea4]">{progressBar(svc.errorRate / 100)}</code>
              <span className="ml-1 text-[#9b9ea4]">
                {svc.errorRate >= 1 ? `${svc.errorRate.toFixed(1)}% errors` : 'healthy'}
              </span>
              <span className="ml-auto text-[#9b9ea4]">{svc.total.toLocaleString()} events</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 border-t border-[#222529] pt-2 text-xs text-[#9b9ea4]">
        {totalEvents.toLocaleString()} total events · {totalErrors} errors
      </div>
    </div>
  );
}
