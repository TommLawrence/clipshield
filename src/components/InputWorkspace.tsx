'use client';

import { useMemo, useState } from 'react';

import { SAMPLE_SCENARIOS } from '@/lib/samples';
import { Badge, Button, Card } from './ui';

export function InputWorkspace({
  value,
  onChange,
  onReset,
}: {
  value: string;
  onChange: (next: string) => void;
  onReset: () => void;
}) {
  const [pasteHint, setPasteHint] = useState(true);
  const chars = value.length;
  const words = useMemo(() => (value.trim() ? value.trim().split(/\s+/).length : 0), [value]);

  return (
    <Card
      title="Input workspace"
      subtitle="Paste sensitive content, or load a fictional sample scenario. Redaction runs locally in your browser."
      actions={
        <Button size="sm" variant="danger" onClick={onReset} disabled={!value}>
          Clear input
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {SAMPLE_SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              onChange(s.content);
              setPasteHint(false);
            }}
            title={s.description}
            className="clip-focus group rounded-lg border border-edge bg-obsidian-850/70 px-3 py-1.5 text-left transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5"
          >
            <span className="block text-xs font-medium text-slate-200 group-hover:text-emerald-200">
              {s.title}
            </span>
            <span className="block text-[10px] text-slate-500">{s.category} · fictional</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setPasteHint(false);
          }}
          onFocus={() => setPasteHint(false)}
          spellCheck={false}
          rows={12}
          placeholder="Paste a support ticket, incident report, log excerpt, vendor document…"
          aria-label="Sensitive content input"
          className="clip-focus w-full resize-y rounded-xl border border-edge bg-obsidian-950/70 p-4 font-mono text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-600"
        />
        {pasteHint && !value && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Badge tone="cyan">100% local — nothing leaves this tab until you choose a route</Badge>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {chars.toLocaleString()} chars · {words.toLocaleString()} words
        </span>
        <span>Input stays in browser memory only</span>
      </div>
    </Card>
  );
}
