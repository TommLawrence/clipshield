'use client';

import { useState } from 'react';

import type { SanitizeResult } from '@/lib/redaction';
import { Badge, Button, Card } from './ui';

/**
 * Redaction preview: side-by-side original vs sanitized with the ability to
 * select text in the sanitized pane and mask it manually.
 */
export function RedactionPreview({
  original,
  sanitized,
  onAddManualMask,
  onCopySanitized,
}: {
  original: string;
  sanitized: string;
  onAddManualMask: (text: string) => void;
  onCopySanitized: () => void;
}) {
  const [selection, setSelection] = useState('');
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'side-by-side' | 'sanitized'>('side-by-side');

  const handleSelection = () => {
    const active = document.activeElement;
    const el =
      active?.id === 'clip-sanitized-pane'
        ? (active as HTMLTextAreaElement)
        : (document.getElementById('clip-sanitized-pane') as HTMLTextAreaElement | null);
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    if (s != null && e != null && e > s) {
      setSelection(el.value.slice(s, e));
    }
  };

  return (
    <Card
      title="Redaction preview"
      subtitle="Verify what will leave your browser. Select any text in the sanitized pane to mask it manually."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-edge text-[11px]">
            {(['side-by-side', 'sanitized'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`clip-focus px-2.5 py-1.5 ${
                  tab === t ? 'bg-slate-raised text-slate-100' : 'text-slate-400 hover:bg-obsidian-850'
                }`}
              >
                {t === 'side-by-side' ? 'Side-by-side' : 'Sanitized only'}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              onCopySanitized();
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? '✓ Copied' : 'Copy sanitized'}
          </Button>
        </div>
      }
    >
      {tab === 'side-by-side' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <Badge tone="rose">Original — stays local</Badge>
            </div>
            <pre className="max-h-72 overflow-auto rounded-xl border border-rose-500/20 bg-obsidian-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap">
              {original || <span className="text-slate-600">No input yet</span>}
            </pre>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <Badge tone="emerald">Sanitized — safe to send</Badge>
            </div>
            <textarea
              id="clip-sanitized-pane"
              readOnly
              value={sanitized}
              onSelect={handleSelection}
              spellCheck={false}
              aria-label="Sanitized output preview"
              className="clip-focus max-h-72 min-h-[8rem] w-full resize-y overflow-auto rounded-xl border border-emerald-500/25 bg-obsidian-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300"
            />
          </div>
        </div>
      ) : (
        <textarea
          id="clip-sanitized-pane"
          readOnly
          value={sanitized}
          onSelect={handleSelection}
          spellCheck={false}
          aria-label="Sanitized output preview"
          className="clip-focus min-h-[12rem] w-full resize-y rounded-xl border border-emerald-500/25 bg-obsidian-950/70 p-3 font-mono text-[11px] leading-relaxed text-slate-300"
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          placeholder="…or type a span to mask"
          aria-label="Text span to mask manually"
          className="clip-focus min-w-0 flex-1 rounded-lg border border-edge bg-obsidian-950/70 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600"
        />
        <Button
          size="sm"
          variant="indigo"
          disabled={!selection.trim()}
          onClick={() => {
            onAddManualMask(selection.trim());
            setSelection('');
          }}
        >
          Mask this text
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Manual masks create <span className="font-mono">[MANUAL_SELECTION_n]</span> tokens stored
        in the in-browser vault alongside the originals. Nothing is persisted.
      </p>
    </Card>
  );
}
