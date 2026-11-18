'use client';

import type { ExecutionResult } from '@/lib/hybrid-ai';
import { Badge, Card } from './ui';

/**
 * Hybrid routing inspector: shows model readiness, the ACTUAL inference
 * source reported by Firebase AI Logic, latency, fallback status and the
 * number of masked entities. Never fabricated.
 */
export function RoutingInspector({
  readiness,
  lastResult,
  maskedCount,
  history,
}: {
  readiness: import('@/lib/hybrid-ai').RouteReadiness | null;
  lastResult: ExecutionResult | null;
  maskedCount: number;
  history: ExecutionResult[];
}) {
  return (
    <Card
      title="Hybrid routing inspector"
      subtitle="Where inference actually executed, straight from result.response.inferenceSource. No simulated values."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Model readiness">
          <span className={readiness?.availability === 'available' ? 'text-emerald-300' : 'text-amber-300'}>
            {readiness
              ? readiness.availability === 'available'
                ? 'Ready (Gemini Nano)'
                : readiness.promptApiAvailable
                  ? readiness.availability
                  : 'Prompt API unavailable'
              : 'Probing…'}
          </span>
        </Metric>

        <Metric label="Inference source (actual)">
          {lastResult ? (
            <span
              className={
                lastResult.inferenceSource === 'on_device'
                  ? 'text-emerald-300'
                  : lastResult.inferenceSource === 'in_cloud'
                    ? 'text-indigo-300'
                    : 'text-rose-300'
              }
            >
              {lastResult.sourceLabel}
            </span>
          ) : (
            <span className="text-slate-500">No run yet</span>
          )}
        </Metric>

        <Metric label="Latency">
          {lastResult ? (
            <span className="font-mono text-slate-200">{lastResult.latencyMs} ms</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </Metric>

        <Metric label="Masked entities">
          <span className="font-mono text-slate-200">{maskedCount}</span>
        </Metric>
      </div>

      {lastResult?.fallbackUsed && (
        <p className="clip-fade-in mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          ⚠ Cloud fallback was used for this hybrid run: on-device inference was unavailable,
          and with your consent the sanitized text went to gemini-4-hydrogen in the cloud.
        </p>
      )}

      {lastResult?.error && (
        <p
          role="alert"
          className="clip-fade-in mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-300"
        >
          {lastResult.error}
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
            Run history (this session)
          </p>
          <ul className="space-y-1">
            {history.map((h, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge/60 bg-obsidian-850/50 px-3 py-1.5 text-[11px]"
              >
                <span className="flex items-center gap-2">
                  <Badge
                    tone={
                      h.mode === 'cloud' ? 'indigo' : h.mode === 'hybrid' ? 'emerald' : 'cyan'
                    }
                  >
                    {h.mode}
                  </Badge>
                  <span
                    className={
                      h.inferenceSource === 'on_device'
                        ? 'text-emerald-300'
                        : h.inferenceSource === 'in_cloud'
                          ? 'text-indigo-300'
                          : 'text-rose-300'
                    }
                  >
                    {h.sourceLabel}
                  </span>
                </span>
                <span className="font-mono text-slate-400">{h.latencyMs} ms</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-edge bg-obsidian-850/70 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium">{children}</p>
    </div>
  );
}
