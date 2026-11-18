'use client';

import { useState } from 'react';

import type { ExecutionResult } from '@/lib/hybrid-ai';
import { rehydrate } from '@/lib/redaction';
import { Badge, Button, Card } from './ui';

/** Renders the analysis output; rehydration is explicit, browser-only. */
export function AnalysisResults({
  result,
  onReset,
}: {
  result: ExecutionResult | null;
  onReset: () => void;
}) {
  const [restored, setRestored] = useState(false);

  if (!result) {
    return (
      <Card title="Analysis results" subtitle="Run one of the three inference modes to see the report here.">
        <p className="py-8 text-center text-sm text-slate-500">
          No analysis yet. Sanitize input, then run a local-first, local-only or cloud analysis.
        </p>
      </Card>
    );
  }

  if (result.error) {
    return (
      <Card title="Analysis results" subtitle="The last run did not produce a report.">
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm leading-relaxed text-rose-200">
          {result.error}
        </p>
      </Card>
    );
  }

  const displayText = restored ? rehydrate(result.text) : result.text;

  return (
    <Card
      title="Analysis results"
      subtitle="Generated from sanitized content only."
      actions={
        <div className="flex items-center gap-2">
          <Badge tone={result.inferenceSource === 'on_device' ? 'emerald' : 'indigo'}>
            {result.sourceLabel}
          </Badge>
          <Badge tone="slate">{result.latencyMs} ms</Badge>
        </div>
      }
    >
      <pre className="clip-fade-in max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-edge bg-obsidian-950/70 p-4 font-sans text-sm leading-relaxed text-slate-200">
        {displayText}
      </pre>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={restored ? 'danger' : 'ghost'}
            onClick={() => setRestored((v) => !v)}
            title="Replaces tokens with original values — in this browser tab only, never saved or sent."
          >
            {restored ? 'Hide original values' : 'Restore original values (local only)'}
          </Button>
          <Button size="sm" onClick={() => navigator.clipboard.writeText(result.text)}>
            Copy report
          </Button>
          <Button size="sm" variant="danger" onClick={onReset}>
            Clear report
          </Button>
        </div>
        {restored && (
          <span className="text-[10px] text-amber-300/80">
            Original values restored in this tab only. Not sent anywhere; cleared on session
            reset.
          </span>
        )}
      </div>
    </Card>
  );
}
