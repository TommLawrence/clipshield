/**
 * ClipShield — Firebase AI Logic hybrid inference layer.
 *
 * PRIVACY CONTRACT: every function in this module accepts ONLY sanitized
 * text (placeholder tokens). The caller-side guard `assertNoOriginalsLeak`
 * runs again here as defense in depth before any request is built.
 *
 * Firebase AI Logic modes implemented:
 *   1. Local-first Hybrid Brief  — InferenceMode.PREFER_ON_DEVICE
 *      (Gemini Nano on-device via Chrome's Prompt API, cloud fallback to
 *      gemini-4-hydrogen only with the user's prior consent)
 *   2. Local-only Private Brief  — InferenceMode.ONLY_ON_DEVICE (fail closed)
 *   3. Deep Cloud Synthesis      — InferenceMode.ONLY_IN_CLOUD, gemini-4-hydrogen
 *
 * IMPORTANT SDK BEHAVIOUR WE DEFEND AGAINST (firebase 13.4.0):
 *   When window.LanguageModel is undefined the SDK creates NO Chrome adapter,
 *   and generateContent then executes IN THE CLOUD even for ONLY_ON_DEVICE
 *   mode. ClipShield therefore checks on-device API support ITSELF and fails
 *   closed before ever calling the SDK for local-only execution. We never
 *   fabricate the inference source: we report whatever
 *   result.response.inferenceSource actually returns, or the honest error.
 */

import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  type AI,
  type GenerateContentResult,
  type GenerativeModel,
} from 'firebase/ai';

import { assertNoOriginalsLeak } from './redaction';
import { ensureAppCheckReady, getFirebaseApp, isFirebaseConfigured } from './firebase';

/** Cloud model for hybrid + cloud modes (hackathon spec). */
export const CLOUD_MODEL = 'gemini-4-hydrogen';
/**
 * The on-device model served through Chrome's Prompt API is Gemini Nano
 * (served by the browser); Firebase AI Logic manages it via the adapter,
 * so no model name is sent for the device leg. `inCloudParams.model` names
 * the cloud fallback model.
 */
export const ON_DEVICE_MODEL_LABEL = 'Gemini Nano (Chrome built-in)';

export type InferenceModeKind = 'hybrid' | 'local-only' | 'cloud';

export interface RouteReadiness {
  /** Chrome Prompt API (window.LanguageModel) present in this browser. */
  promptApiAvailable: boolean;
  /** Current on-device availability as reported by Chrome. */
  availability: 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown';
  /** Chrome version >= 139 check (Prompt API requirement). */
  chromeSupported: boolean | null;
}

export interface ExecutionResult {
  mode: InferenceModeKind;
  /** Actual source reported by Firebase AI Logic. Never fabricated. */
  inferenceSource: 'on_device' | 'in_cloud' | 'unavailable';
  /** Honest label for the UI. */
  sourceLabel: string;
  text: string;
  latencyMs: number;
  /** For hybrid mode: whether cloud fallback was used. */
  fallbackUsed: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* AI instance + model factories                                      */
/* ------------------------------------------------------------------ */

let aiInstance: AI | null = null;

export function getAIInstance(): AI {
  if (!aiInstance) {
    const app = getFirebaseApp();
    aiInstance = getAI(app, { backend: new GoogleAIBackend() });
  }
  return aiInstance;
}

/**
 * Hybrid model: prefer on-device (Gemini Nano), fall back in-cloud to
 * gemini-4-hydrogen. Shared response schema keeps local/cloud legs aligned.
 */
export function getHybridModel(): GenerativeModel {
  return getGenerativeModel(getAIInstance(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: { model: CLOUD_MODEL },
  });
}

/** Local-only model: ONLY_ON_DEVICE, never touches the network. */
export function getLocalOnlyModel(): GenerativeModel {
  return getGenerativeModel(getAIInstance(), {
    mode: InferenceMode.ONLY_ON_DEVICE,
    inCloudParams: { model: CLOUD_MODEL },
  });
}

/** Cloud-only model: ONLY_IN_CLOUD on gemini-4-hydrogen. */
export function getCloudModel(): GenerativeModel {
  return getGenerativeModel(getAIInstance(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: CLOUD_MODEL },
  });
}

/* ------------------------------------------------------------------ */
/* Readiness (no automatic downloads — user gesture required)          */
/* ------------------------------------------------------------------ */

/** Detects Chrome version from the UA; returns null if not Chrome. */
export function detectChromeVersion(): number | null {
  if (typeof navigator === 'undefined') return null;
  const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}

/** Cheap readiness probe; never downloads anything. */
export async function probeReadiness(): Promise<RouteReadiness> {
  const chromeVersion = detectChromeVersion();
  const promptApiAvailable =
    typeof window !== 'undefined' && 'LanguageModel' in window;

  let availability: RouteReadiness['availability'] = 'unknown';
  if (promptApiAvailable) {
    try {
      const status = await (
        window as unknown as {
          LanguageModel: { availability: () => Promise<string> };
        }
      ).LanguageModel.availability();
      availability =
        status === 'available' ||
        status === 'downloadable' ||
        status === 'downloading' ||
        status === 'unavailable'
          ? (status as RouteReadiness['availability'])
          : 'unknown';
    } catch {
      availability = 'unknown';
    }
  }

  return {
    promptApiAvailable,
    availability,
    chromeSupported: chromeVersion === null ? null : chromeVersion >= 139,
  };
}

/**
 * Prepares the on-device model (may trigger a Chrome download with progress
 * events). MUST be called from a genuine user gesture — ClipShield only
 * wires this to button clicks, never to page mount.
 */
export async function prepareOnDeviceModel(
  onProgress?: (fraction: number) => void,
): Promise<void> {
  await ensureAppCheckReady();
  const model = getHybridModel();
  await model.initializeDeviceModel(onProgress);
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const BRIEF_SYSTEM = [
  'You are ClipShield, a privacy-focused analyst. You receive text whose',
  'sensitive values have already been replaced by placeholders such as',
  '[EMAIL_1] or [SECRET_1]. Never attempt to guess the hidden values.',
  'Produce a concise brief: (1) one-paragraph summary, (2) 3-5 key points,',
  '(3) 2-4 suggested next actions. Keep placeholders as-is in your answer.',
].join(' ');

const SYNTHESIS_SYSTEM = [
  'You are ClipShield, a security and privacy analyst. You receive text whose',
  'sensitive values have already been replaced by placeholders such as',
  '[EMAIL_1] or [SECRET_1]. Never attempt to guess the hidden values.',
  'Produce a structured analysis with: executive summary; security and',
  'privacy findings; a risk matrix (severity + explanation per risk);',
  'recommended action items; operational considerations; and areas that',
  'require human verification. Keep placeholders as-is.',
].join(' ');

/* ------------------------------------------------------------------ */
/* The three inference operations                                      */
/* ------------------------------------------------------------------ */

function toExecutionResult(
  mode: InferenceModeKind,
  result: GenerateContentResult,
  startedAt: number,
): ExecutionResult {
  const source = result.response.inferenceSource ?? InferenceSource.IN_CLOUD;
  const onDevice = source === InferenceSource.ON_DEVICE;
  return {
    mode,
    inferenceSource: onDevice ? 'on_device' : 'in_cloud',
    sourceLabel: onDevice ? 'ON_DEVICE (Gemini Nano via Chrome Prompt API)' : 'IN_CLOUD',
    text: result.response.text() ?? '',
    latencyMs: Math.round(performance.now() - startedAt),
    fallbackUsed: mode === 'hybrid' && !onDevice,
  };
}

/**
 * MODE 1 — Local-first Hybrid Brief.
 * PREFER_ON_DEVICE with consented cloud fallback to gemini-4-hydrogen.
 * `consentToFallback` must be true; the UI collects it before the call.
 */
export async function runHybridBrief(
  sanitizedText: string,
  consentToFallback: boolean,
): Promise<ExecutionResult> {
  if (!consentToFallback) {
    throw new Error('Cloud fallback consent is required for hybrid mode.');
  }
  if (!assertNoOriginalsLeak(sanitizedText)) {
    throw new Error('Blocked: sanitized text still contains an original sensitive value.');
  }
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  await ensureAppCheckReady();

  const model = getHybridModel();
  const startedAt = performance.now();
  const result = await model.generateContent({
    systemInstruction: BRIEF_SYSTEM,
    contents: userContent(sanitizedText),
  });
  return toExecutionResult('hybrid', result, startedAt);
}

/**
 * MODE 2 — Local-only Private Brief. ONLY_ON_DEVICE, fail closed.
 *
 * Fail-closed contract enforced BEFORE touching the SDK:
 *   - If window.LanguageModel is missing, we refuse to run. (The SDK would
 *     silently route to cloud in this case — unacceptable for this mode.)
 *   - If Chrome reports anything other than "available", we refuse to run.
 * Then the SDK call itself uses ONLY_ON_DEVICE, which also errors when the
 * model is unavailable — we surface that error instead of falling back.
 */
export async function runLocalOnlyBrief(
  sanitizedText: string,
): Promise<ExecutionResult> {
  if (!assertNoOriginalsLeak(sanitizedText)) {
    throw new Error('Blocked: sanitized text still contains an original sensitive value.');
  }
  const readiness = await probeReadiness();
  if (!readiness.promptApiAvailable) {
    return {
      mode: 'local-only',
      inferenceSource: 'unavailable',
      sourceLabel: 'ON-DEVICE UNAVAILABLE',
      text: '',
      latencyMs: 0,
      fallbackUsed: false,
      error:
        'On-device inference is not available in this browser. Chrome 139+ ' +
        'desktop with the built-in AI model is required. This mode never ' +
        'falls back to the cloud.',
    };
  }
  if (readiness.availability !== 'available') {
    return {
      mode: 'local-only',
      inferenceSource: 'unavailable',
      sourceLabel: 'ON-DEVICE UNAVAILABLE',
      text: '',
      latencyMs: 0,
      fallbackUsed: false,
      error:
        readiness.availability === 'downloadable'
          ? 'The on-device model needs to be downloaded first. Click "Prepare Local AI" (this triggers the download from within Chrome) and try again.'
          : readiness.availability === 'downloading'
            ? 'The on-device model is still downloading. Wait for it to complete, then try again.'
            : 'The on-device model cannot run on this device (hardware or policy restriction). This mode never falls back to the cloud.',
    };
  }

  await ensureAppCheckReady();
  const model = getLocalOnlyModel();
  const startedAt = performance.now();
  try {
    const result = await model.generateContent({
      systemInstruction: BRIEF_SYSTEM,
      contents: userContent(sanitizedText),
    });
    // Defense in depth: if the SDK somehow answered from the cloud, we must
    // not present it as on-device success in this mode.
    const source = result.response.inferenceSource;
    if (source !== InferenceSource.ON_DEVICE) {
      return {
        mode: 'local-only',
        inferenceSource: 'unavailable',
        sourceLabel: 'ON-DEVICE UNAVAILABLE (blocked cloud answer)',
        text: '',
        latencyMs: Math.round(performance.now() - startedAt),
        fallbackUsed: false,
        error: 'Local-only guard: the SDK did not confirm on-device execution; result discarded.',
      };
    }
    return toExecutionResult('local-only', result, startedAt);
  } catch (err) {
    return {
      mode: 'local-only',
      inferenceSource: 'unavailable',
      sourceLabel: 'ON-DEVICE UNAVAILABLE',
      text: '',
      latencyMs: Math.round(performance.now() - startedAt),
      fallbackUsed: false,
      error: `On-device execution failed: ${err instanceof Error ? err.message : String(err)}. No cloud fallback was attempted.`,
    };
  }
}

/**
 * MODE 3 — Deep Cloud Synthesis. ONLY_IN_CLOUD on gemini-4-hydrogen.
 * `confirmCloudSend` must be true; the UI collects explicit confirmation.
 */
export async function runCloudSynthesis(
  sanitizedText: string,
  confirmCloudSend: boolean,
): Promise<ExecutionResult> {
  if (!confirmCloudSend) {
    throw new Error('Explicit confirmation is required before cloud synthesis.');
  }
  if (!assertNoOriginalsLeak(sanitizedText)) {
    throw new Error('Blocked: sanitized text still contains an original sensitive value.');
  }
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  await ensureAppCheckReady();

  const model = getCloudModel();
  const startedAt = performance.now();
  const result = await model.generateContent({
    systemInstruction: SYNTHESIS_SYSTEM,
    contents: userContent(sanitizedText),
  });
  return toExecutionResult('cloud', result, startedAt);
}

/** Shared response schema, identical for local and cloud legs. */
export function buildSharedResponseSchema(): Schema {
  return Schema.object({
    description: 'Structured analysis of sanitized content',
    properties: {
      executiveSummary: Schema.string({ description: 'One-paragraph executive summary' }),
      findings: Schema.array({
        description: 'Security and privacy findings',
        items: Schema.object({
          properties: {
            title: Schema.string(),
            severity: Schema.enumString({ enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] }),
            explanation: Schema.string(),
          },
        }),
      }),
      actionItems: Schema.array({ items: Schema.string() }),
      verificationNeeded: Schema.array({ items: Schema.string() }),
    },
  });
}

/** Builds the user content for a generateContent call. */
function userContent(sanitizedText: string) {
  return [
    { role: 'user' as const, parts: [{ type: 'text' as const, text: sanitizedText }] },
  ];
}

export { InferenceMode, InferenceSource };
