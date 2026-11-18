'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AnalysisResults } from '@/components/AnalysisResults';
import { InferenceControls } from '@/components/InferenceControls';
import { InputWorkspace } from '@/components/InputWorkspace';
import { PrivacyInspection } from '@/components/PrivacyInspection';
import { RedactionPreview } from '@/components/RedactionPreview';
import { RoutingInspector } from '@/components/RoutingInspector';
import { Badge, Button } from '@/components/ui';
import { isFirebaseConfigured } from '@/lib/firebase';
import {
  probeReadiness,
  prepareOnDeviceModel,
  runCloudSynthesis,
  runHybridBrief,
  runLocalOnlyBrief,
  type ExecutionResult,
  type RouteReadiness,
} from '@/lib/hybrid-ai';
import { assessExposure } from '@/lib/risk-engine';
import {
  applyDismissals,
  clearVault,
  containsAnyOriginal,
  getVaultSize,
  resetSession,
  sanitize,
  type SanitizeResult,
} from '@/lib/redaction';
import { bucketLatency, recordInferenceRun } from '@/lib/telemetry';

export default function WorkspacePage() {
  // ---- Input & redaction state -------------------------------------
  const [input, setInput] = useState('');
  const [customTermsRaw, setCustomTermsRaw] = useState('');
  const [sanitizeResult, setSanitizeResult] = useState<SanitizeResult | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [manualMasks, setManualMasks] = useState<{ text: string; note?: string }[]>([]);

  // ---- Inference state ----------------------------------------------
  const [readiness, setReadiness] = useState<RouteReadiness | null>(null);
  const [prepProgress, setPrepProgress] = useState<number | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [forceOnDevice, setForceOnDevice] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const [history, setHistory] = useState<ExecutionResult[]>([]);
  const [vaultSize, setVaultSize] = useState(0);
  const [firebaseReady, setFirebaseReady] = useState(false);

  const customTerms = useMemo(
    () =>
      customTermsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    [customTermsRaw],
  );

  // Re-sanitize whenever input or custom terms change (debounced).
  useEffect(() => {
    if (!input.trim()) {
      setSanitizeResult(null);
      return;
    }
    const t = setTimeout(() => {
      setSanitizeResult(sanitize(input, customTerms));
      setDismissedIds(new Set());
      setManualMasks([]);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, customTermsRaw]);

  // Probe readiness on mount — a passive check only, NO model download.
  useEffect(() => {
    probeReadiness().then(setReadiness);
    setFirebaseReady(isFirebaseConfigured());
  }, []);

  // Keep the vault-size badge fresh without re-rendering on every keystroke.
  useEffect(() => {
    setVaultSize(getVaultSize());
  }, [sanitizeResult, manualMasks]);

  // ---- Derived sanitized output -------------------------------------
  const effective = useMemo(() => {
    if (!sanitizeResult) return null;
    return applyDismissals(
      sanitizeResult.sanitized,
      sanitizeResult.findings,
      [...dismissedIds],
      manualMasks,
    );
  }, [sanitizeResult, dismissedIds, manualMasks]);

  const assessment = useMemo(
    () =>
      sanitizeResult
        ? assessExposure(
            sanitizeResult.findings.filter((f) => !dismissedIds.has(f.id)),
            input.length,
          )
        : null,
    [sanitizeResult, dismissedIds, input.length],
  );

  const sanitizedReady = Boolean(
    effective && effective.sanitized.trim() && !containsAnyOriginal(effective.sanitized),
  );

  // ---- Handlers ------------------------------------------------------
  const toggleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addManualMask = useCallback((text: string) => {
    setManualMasks((prev) => [...prev, { text, note: 'Manually selected by user' }]);
  }, []);

  const handlePrepare = useCallback(async () => {
    setLastError(null);
    setPrepProgress(0);
    try {
      await prepareOnDeviceModel((p) => setPrepProgress(p));
      setPrepProgress(1);
      setReadiness(await probeReadiness());
    } catch (err) {
      setPrepProgress(null);
      setReadiness(await probeReadiness());
      setLastError(
        `Preparing the on-device model failed: ${
          err instanceof Error ? err.message : String(err)
        }. Chrome 139+ desktop with the built-in AI model enabled is required.`,
      );
    }
  }, []);

  const finishRun = useCallback(
    (result: ExecutionResult) => {
      setLastResult(result);
      if (!result.error) setHistory((h) => [result, ...h].slice(0, 8));
      setRunning(null);
      // Coarse, non-sensitive telemetry only.
      void recordInferenceRun({
        kind: 'inference_run',
        mode: result.mode,
        outcome: result.error
          ? 'error'
          : result.inferenceSource === 'unavailable'
            ? 'unavailable'
            : 'success',
        latencyBucketMs: bucketLatency(result.latencyMs),
        maskedCount: effective?.findings.length ?? 0,
        categories: (effective?.findings ?? []).map((f) => f.category),
      });
    },
    [effective],
  );

  const runMode = useCallback(
    async (mode: 'hybrid' | 'local-only' | 'cloud') => {
      if (!effective) return;
      setRunning(mode);
      setLastError(null);
      try {
        if (mode === 'hybrid') {
          finishRun(await runHybridBrief(effective.sanitized, cloudConsent));
        } else if (mode === 'local-only') {
          finishRun(await runLocalOnlyBrief(effective.sanitized));
        } else {
          finishRun(await runCloudSynthesis(effective.sanitized, cloudConsent));
        }
      } catch (err) {
        setRunning(null);
        setLastError(err instanceof Error ? err.message : String(err));
      }
    },
    [effective, cloudConsent, finishRun],
  );

  const resetWorkspace = useCallback(() => {
    setInput('');
    setCustomTermsRaw('');
    setSanitizeResult(null);
    setDismissedIds(new Set());
    setManualMasks([]);
    setLastResult(null);
    setHistory([]);
    setLastError(null);
    resetSession();
    setVaultSize(0);
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/40 bg-emerald-500/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6l7-3z"
                stroke="#34d399"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M9 12l2 2 4-4"
                stroke="#34d399"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-100">ClipShield</h1>
            <p className="text-[11px] text-slate-400">
              Sanitize first. Route consciously. Make privacy observable.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={firebaseReady ? 'emerald' : 'amber'}>
            {firebaseReady ? 'Firebase configured' : 'Firebase config missing'}
          </Badge>
          <Badge tone="slate">Vault: {vaultSize} tokens in memory</Badge>
          <Button size="sm" variant="danger" onClick={resetWorkspace}>
            Reset session
          </Button>
        </div>
      </header>

      {/* Privacy banner */}
      <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-relaxed text-emerald-100/80">
        <strong className="font-semibold text-emerald-300">Privacy airlock active.</strong>{' '}
        Detection runs entirely in your browser. Original values and the rehydration mapping stay
        in tab memory — never persisted, never sent to AI, never logged. Detection is best-effort;
        always review the preview. ClipShield is not a certified security product.
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <InputWorkspace
            value={input}
            onChange={setInput}
            onReset={() => {
              setInput('');
              clearVault();
            }}
          />
          {assessment && sanitizeResult && (
            <PrivacyInspection
              assessment={assessment}
              findings={sanitizeResult.findings}
              dismissedIds={dismissedIds}
              onToggleDismiss={toggleDismiss}
              customTerms={customTermsRaw}
              onCustomTermsChange={setCustomTermsRaw}
            />
          )}
          {effective && (
            <RedactionPreview
              original={input}
              sanitized={effective.sanitized}
              onAddManualMask={addManualMask}
              onCopySanitized={() => navigator.clipboard.writeText(effective.sanitized)}
            />
          )}
        </div>

        <div className="space-y-5">
          <RoutingInspector
            readiness={readiness}
            lastResult={lastResult}
            maskedCount={effective?.findings.length ?? 0}
            history={history}
          />
          <InferenceControls
            readiness={readiness}
            sanitizedReady={sanitizedReady}
            running={running}
            prepProgress={prepProgress}
            onPrepare={handlePrepare}
            onHybrid={() => runMode('hybrid')}
            onLocalOnly={() => runMode('local-only')}
            onCloud={() => runMode('cloud')}
            cloudConsent={cloudConsent}
            onCloudConsentChange={setCloudConsent}
            forceOnDevice={forceOnDevice}
            onForceOnDeviceChange={setForceOnDevice}
            lastError={lastError}
          />
          <AnalysisResults result={lastResult} onReset={() => setLastResult(null)} />
        </div>
      </div>

      <footer className="mt-10 border-t border-edge pt-4 text-[10px] leading-relaxed text-slate-500">
        ClipShield — hackathon build for Google #BuildHybridAI 2026. Sample data is fictional.
        On-device inference requires Chrome 139+ desktop with the built-in AI model. Detection is
        best-effort pattern matching and must not replace human review. Apache-2.0 licensed.
      </footer>
    </main>
  );
}
