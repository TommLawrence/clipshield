/**
 * ClipShield — minimal, non-sensitive telemetry.
 *
 * PRIVACY CONTRACT: telemetry records only coarse operation counters
 * (mode, outcome, latency bucket, masked-entity count, placeholder
 * categories). It NEVER includes: original input, sanitized prompt text,
 * rehydration mappings, model responses, or any user content.
 *
 * Telemetry is fire-and-forget to Firestore (opt-in feature) and failures
 * are silently ignored — analytics must never break the workspace.
 */

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { getDb, ensureAnonymousUser, isFirebaseConfigured } from './firebase';
import type { InferenceModeKind } from './hybrid-ai';
import type { SensitiveCategory } from './redaction';

export interface TelemetryEvent {
  kind: 'inference_run';
  mode: InferenceModeKind;
  outcome: 'success' | 'error' | 'unavailable';
  /** Rounded to nearest 250ms bucket to avoid fine-grained timing signals. */
  latencyBucketMs: number;
  /** Number of masked entities (integer only). */
  maskedCount: number;
  /** Category names only — never values. */
  categories: SensitiveCategory[];
}

export async function recordInferenceRun(event: TelemetryEvent): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await ensureAnonymousUser();
    await addDoc(collection(getDb(), 'telemetry'), {
      kind: event.kind,
      mode: event.mode,
      outcome: event.outcome,
      latencyBucketMs: event.latencyBucketMs,
      maskedCount: event.maskedCount,
      categories: event.categories,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Telemetry is best-effort and never blocks the user workflow.
  }
}

export async function listRecentTelemetry(
  max = 20,
): Promise<TelemetryEvent[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snap = await getDocs(
      query(collection(getDb(), 'telemetry'), orderBy('createdAt', 'desc'), limit(max)),
    );
    return snap.docs.map((d) => {
      const data = d.data() as TelemetryEvent;
      return {
        kind: data.kind,
        mode: data.mode,
        outcome: data.outcome,
        latencyBucketMs: data.latencyBucketMs,
        maskedCount: data.maskedCount,
        categories: data.categories ?? [],
      };
    });
  } catch {
    return [];
  }
}

/** Buckets latency to the nearest 250ms. */
export function bucketLatency(ms: number): number {
  return Math.round(ms / 250) * 250;
}
