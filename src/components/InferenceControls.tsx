'use client';

import type { RouteReadiness } from '@/lib/hybrid-ai';
import { Badge, Button, Card, Toggle } from './ui';

export function InferenceControls({
  readiness,
  sanitizedReady,
  running,
  prepProgress,
  onPrepare,
  onHybrid,
  onLocalOnly,
  onCloud,
  cloudConsent,
  onCloudConsentChange,
  forceOnDevice,
  onForceOnDeviceChange,
  lastError,
}: {
  readiness: RouteReadiness | null;
  sanitizedReady: boolean;
  running: string | null;
  prepProgress: number | null;
  onPrepare: () => void;
  onHybrid: () => void;
  onLocalOnly: () => void;
  onCloud: () => void;
  cloudConsent: boolean;
  onCloudConsentChange: (v: boolean) => void;
  forceOnDevice: boolean;
  onForceOnDeviceChange: (v: boolean) => void;
  lastError: string | null;
}) {
  const deviceReady = readiness?.availability === 'available';
  const preparing = prepProgress !== null && prepProgress < 1;

  return (
    <Card
      title="Inference controls"
      subtitle="Three genuine Firebase AI Logic routes. Consent is collected before anything is sent anywhere."
    >
      {/* Model readiness + prepare button */}
      <div className="mb-4 rounded-xl border border-edge bg-obsidian-850/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={deviceReady ? 'emerald' : readiness?.promptApiAvailable ? 'amber' : 'rose'}>
              {deviceReady
                ? '✓ On-device model ready'
                : readiness?.promptApiAvailable
                  ? `On-device model: ${readiness.availability}`
                  : 'Prompt API not detected'}
            </Badge>
            {readiness?.chromeSupported !== null && readiness !== null && (
              <Badge tone={readiness.chromeSupported ? 'emerald' : 'rose'}>
                Chrome {readiness.chromeSupported ? '139+' : '< 139'}
              </Badge>
            )}
            {readiness?.chromeSupported === null && (
              <Badge tone="slate">Non-Chromium browser</Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={onPrepare}
            disabled={!readiness?.promptApiAvailable || preparing}
            title="Downloads the Chrome built-in model if needed. Triggered by this click, never automatically."
          >
            {preparing
              ? `Preparing… ${(prepProgress! * 100).toFixed(0)}%`
              : 'Prepare Local AI'}
          </Button>
        </div>
        {preparing && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-raised">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all"
              style={{ width: `${Math.max(3, prepProgress! * 100)}%` }}
            />
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          The on-device model (Gemini Nano) is served by Chrome's built-in AI on desktop Chrome
          139+ with sufficient disk/memory. The download only starts when you click — never on
          page load.
        </p>
      </div>

      {/* Force on-device only */}
      <div className="mb-4">
        <Toggle
          checked={forceOnDevice}
          onChange={onForceOnDeviceChange}
          label="Force on-device only"
          description="When enabled, cloud-based buttons are disabled. This is a genuine routing control: only on-device execution is permitted while it is on."
        />
      </div>

      {/* The three modes */}
      <div className="grid gap-3 md:grid-cols-3">
        <ModeButton
          title="Local-first Hybrid Brief"
          chip="PREFER_ON_DEVICE"
          tone="emerald"
          description="Brief from Gemini Nano on-device. If local is unavailable, Firebase AI Logic falls back to gemini-4-hydrogen in the cloud."
          disabled={!sanitizedReady || running !== null || forceOnDevice === false ? !sanitizedReady || running !== null : false}
          fallbackNote="Consent to cloud fallback is required below."
          running={running === 'hybrid'}
          onClick={onHybrid}
          consentOk
        />
        <ModeButton
          title="Local-only Private Brief"
          chip="ONLY_ON_DEVICE"
          tone="emerald"
          description="Strictly on-device. Fails closed — never touches the network, even if the local model is unavailable."
          disabled={!sanitizedReady || running !== null}
          running={running === 'local-only'}
          onClick={onLocalOnly}
          consentOk
        />
        <ModeButton
          title="Deep Cloud Synthesis"
          chip="ONLY_IN_CLOUD · gemini-4-hydrogen"
          tone="indigo"
          description="Full structured analysis on the cloud model. Requires explicit confirmation below."
          disabled={!sanitizedReady || running !== null || forceOnDevice}
          fallbackNote="Confirmation required below."
          running={running === 'cloud'}
          onClick={onCloud}
          consentOk={cloudConsent}
        />
      </div>

      {/* Consent switches */}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Toggle
          checked={cloudConsent}
          onChange={onCloudConsentChange}
          label="I consent to cloud fallback / cloud synthesis"
          description="Hybrid mode: if on-device inference is unavailable, the sanitized text will be sent to gemini-4-hydrogen in the cloud. Cloud mode: the sanitized text will be sent to the cloud model."
        />
      </div>

      {lastError && (
        <p
          role="alert"
          className="clip-fade-in mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-300"
        >
          {lastError}
        </p>
      )}
    </Card>
  );
}

function ModeButton({
  title,
  chip,
  tone,
  description,
  disabled,
  running,
  onClick,
  consentOk,
  fallbackNote,
}: {
  title: string;
  chip: string;
  tone: 'emerald' | 'indigo';
  description: string;
  disabled: boolean;
  running: boolean;
  onClick: () => void;
  consentOk: boolean;
  fallbackNote?: string;
}) {
  const border =
    tone === 'emerald' ? 'hover:border-emerald-500/60' : 'hover:border-indigo-500/60';
  return (
    <div className="flex flex-col rounded-xl border border-edge bg-obsidian-850/70 p-3">
      <Badge tone={tone} title={chip}>
        {chip}
      </Badge>
      <h3 className="mt-2 text-sm font-semibold text-slate-100">{title}</h3>
      <p className="mt-1 flex-1 text-[11px] leading-relaxed text-slate-400">{description}</p>
      <Button
        variant={tone}
        size="sm"
        className={`mt-3 w-full ${border}`}
        disabled={disabled}
        onClick={onClick}
        aria-label={title}
      >
        {running ? 'Running…' : 'Run'}
      </Button>
      {!consentOk && fallbackNote && (
        <p className="mt-1.5 text-[10px] text-amber-300/80">{fallbackNote}</p>
      )}
    </div>
  );
}
