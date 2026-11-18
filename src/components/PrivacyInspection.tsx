'use client';

import { useState } from 'react';

import type { Finding, SensitiveCategory } from '@/lib/redaction';
import type { ExposureAssessment } from '@/lib/risk-engine';
import { CATEGORY_LABELS } from '@/lib/categories';
import { Badge, Card, ScoreDial } from './ui';

export function PrivacyInspection({
  assessment,
  findings,
  dismissedIds,
  onToggleDismiss,
  customTerms,
  onCustomTermsChange,
}: {
  assessment: ExposureAssessment;
  findings: Finding[];
  dismissedIds: Set<string>;
  onToggleDismiss: (id: string) => void;
  customTerms: string;
  onCustomTermsChange: (next: string) => void;
}) {
  const [showMath, setShowMath] = useState(false);

  return (
    <Card
      title="Privacy inspection"
      subtitle="Detected entities, categories, severity and the deterministic exposure score. Detection is best-effort — review before running AI."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ScoreDial score={assessment.score} severity={assessment.severity} />
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Findings" value={assessment.totalFindings} />
          <Stat label="Masked" value={assessment.totalMasked} />
          <Stat
            label="Sensitive chars"
            value={`${(assessment.sensitiveCharRatio * 100).toFixed(0)}%`}
          />
        </div>
      </div>

      {/* Per-category breakdown */}
      {assessment.stats.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-edge text-slate-400">
                <th className="py-2 pr-3 font-medium">Category</th>
                <th className="py-2 pr-3 font-medium">Count</th>
                <th className="py-2 pr-3 font-medium">Severity</th>
                <th className="py-2 font-medium">Why it matters</th>
              </tr>
            </thead>
            <tbody>
              {assessment.stats.map((s) => (
                <tr key={s.category} className="border-b border-edge/50">
                  <td className="py-2 pr-3">
                    <Badge
                      tone={
                        s.severity === 'CRITICAL'
                          ? 'rose'
                          : s.severity === 'HIGH'
                            ? 'amber'
                            : s.severity === 'MEDIUM'
                              ? 'cyan'
                              : 'slate'
                      }
                    >
                      {CATEGORY_LABELS[s.category as SensitiveCategory] ?? s.category}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-slate-300">{s.count}×</td>
                  <td className="py-2 pr-3 text-slate-300">{s.severity}</td>
                  <td className="py-2 text-slate-400">{s.explanation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Findings list with dismiss controls */}
      {findings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Findings — un-mask any false positive
          </p>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {findings.map((f) => {
              const dismissed = dismissedIds.has(f.id);
              return (
                <li
                  key={f.id}
                  className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                    dismissed
                      ? 'border-edge/50 bg-obsidian-850/40 opacity-60'
                      : 'border-edge bg-obsidian-850/80'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-300">
                      <span className="text-emerald-300">{f.token}</span>
                      <span className="mx-2 text-slate-600">←</span>
                      {maskPreview(f.original)}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">{f.reason}</p>
                  </div>
                  <button
                    onClick={() => onToggleDismiss(f.id)}
                    aria-label={dismissed ? `Restore mask ${f.id}` : `Un-mask ${f.id}`}
                    className="clip-focus shrink-0 rounded-md border border-edge px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-raised"
                  >
                    {dismissed ? 'Re-mask' : 'Un-mask'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Custom terms */}
      <div className="mt-4">
        <label
          htmlFor="custom-terms"
          className="block text-[11px] uppercase tracking-wide text-slate-500"
        >
          Custom sensitive terms (comma-separated)
        </label>
        <input
          id="custom-terms"
          value={customTerms}
          onChange={(e) => onCustomTermsChange(e.target.value)}
          placeholder="e.g. Project Aurora, TAG-77341, Northern Plant"
          className="clip-focus mt-1.5 w-full rounded-lg border border-edge bg-obsidian-950/70 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600"
        />
      </div>

      {/* Score math */}
      <div className="mt-4">
        <button
          onClick={() => setShowMath((v) => !v)}
          aria-expanded={showMath}
          className="clip-focus text-[11px] text-slate-400 underline decoration-dotted hover:text-slate-200"
        >
          {showMath ? 'Hide' : 'Show'} how this score was calculated
        </button>
        {showMath && (
          <pre className="clip-fade-in mt-2 overflow-x-auto rounded-lg border border-edge bg-obsidian-950/80 p-3 font-mono text-[10px] leading-relaxed text-slate-400">
{`score = Σ category_weight × (1 − 1/(count+1))  [capped at 100]
+ density bonus when >30% of characters are sensitive

${assessment.explanationLines.join('\n')}

final score = ${assessment.score} (${assessment.severity})`}
          </pre>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-edge bg-obsidian-850/70 px-4 py-2">
      <p className="font-mono text-lg font-semibold text-slate-200">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

/** Shows a censored preview of the original value in the findings list. */
function maskPreview(original: string): string {
  if (original.length <= 6) return '•'.repeat(original.length);
  return original.slice(0, 3) + '•'.repeat(Math.min(10, original.length - 5)) + original.slice(-2);
}
