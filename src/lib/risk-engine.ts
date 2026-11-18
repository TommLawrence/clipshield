/**
 * ClipShield — deterministic exposure scoring.
 *
 * NOT an AI risk score. The score is computed from the categories and counts
 * of detected findings plus a few structural signals, with a published
 * formula the UI can explain line by line. Same input -> same score.
 */

import type { Finding, SensitiveCategory } from './redaction';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CategoryStat {
  category: SensitiveCategory;
  count: number;
  severity: Severity;
  weight: number;
  explanation: string;
}

export interface ExposureAssessment {
  /** 0-100 deterministic exposure score. */
  score: number;
  severity: Severity;
  stats: CategoryStat[];
  /** Percentage of characters in the input that were sensitive. */
  sensitiveCharRatio: number;
  totalFindings: number;
  totalMasked: number;
  explanationLines: string[];
}

/** Per-finding weight per category (published in README). */
export const CATEGORY_WEIGHTS: Record<SensitiveCategory, number> = {
  PRIVATE_KEY: 34,
  GITHUB_TOKEN: 30,
  API_KEY: 30,
  BEARER_TOKEN: 28,
  JWT: 26,
  CLOUD_CREDENTIAL: 24,
  EMAIL: 10,
  PHONE: 9,
  IPV4: 12,
  CUSTOM_TERM: 8,
  MANUAL_SELECTION: 8,
};

const CATEGORY_SEVERITY: Record<SensitiveCategory, Severity> = {
  PRIVATE_KEY: 'CRITICAL',
  GITHUB_TOKEN: 'CRITICAL',
  API_KEY: 'CRITICAL',
  BEARER_TOKEN: 'HIGH',
  JWT: 'HIGH',
  CLOUD_CREDENTIAL: 'HIGH',
  IPV4: 'MEDIUM',
  EMAIL: 'MEDIUM',
  PHONE: 'MEDIUM',
  CUSTOM_TERM: 'LOW',
  MANUAL_SELECTION: 'LOW',
};

const CATEGORY_EXPLANATION: Record<SensitiveCategory, string> = {
  PRIVATE_KEY: 'Private keys grant direct system access if leaked.',
  GITHUB_TOKEN: 'GitHub tokens can expose source code and act on repositories.',
  API_KEY: 'API keys can be replayed for quota theft or account takeover.',
  BEARER_TOKEN: 'Bearer tokens authenticate as the holder until expiry.',
  JWT: 'JWTs may carry identity claims and can bypass authentication.',
  CLOUD_CREDENTIAL: 'Cloud secret keys may grant programmatic infrastructure access.',
  IPV4: 'Internal IPs reveal network topology to an attacker.',
  EMAIL: 'Email addresses identify individuals (GDPR/CCPA personal data).',
  PHONE: 'Phone numbers identify individuals and enable targeting.',
  CUSTOM_TERM: 'User-flagged confidential term.',
  MANUAL_SELECTION: 'Manually selected text the user chose to mask.',
};

/** Deterministic score: sum of weights with per-category sub-linear growth. */
export function assessExposure(
  findings: Finding[],
  inputLength: number,
): ExposureAssessment {
  const byCategory = new Map<SensitiveCategory, number>();
  let maskedChars = 0;
  for (const f of findings) {
    byCategory.set(f.category, (byCategory.get(f.category) ?? 0) + 1);
    maskedChars += f.original.length;
  }

  const stats: CategoryStat[] = [...byCategory.entries()]
    .map(([category, count]) => ({
      category,
      count,
      severity: CATEGORY_SEVERITY[category],
      weight: CATEGORY_WEIGHTS[category],
      explanation: CATEGORY_EXPLANATION[category],
    }))
    .sort((a, b) => b.weight - a.weight || a.category.localeCompare(b.category));

  // Score formula (deterministic, published):
  //   score = Σ category  weight × (1 - 1/(count+1))   … diminishing per extra hit
  //   capped at 100.
  let score = 0;
  const explanationLines: string[] = [];
  for (const s of stats) {
    const contribution = s.weight * (1 - 1 / (s.count + 1));
    score += contribution;
    explanationLines.push(
      `${s.category}: ${s.count}×${s.weight} pts → +${contribution.toFixed(1)} (${s.severity})`,
    );
  }
  // Structural bonus: if a large share of the doc is sensitive, nudge up.
  const sensitiveCharRatio = inputLength > 0 ? maskedChars / inputLength : 0;
  if (sensitiveCharRatio > 0.3) {
    const bonus = Math.min(10, (sensitiveCharRatio - 0.3) * 25);
    score += bonus;
    explanationLines.push(
      `Density bonus: ${(sensitiveCharRatio * 100).toFixed(0)}% of characters are sensitive → +${bonus.toFixed(1)}`,
    );
  }
  score = Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;

  const severity: Severity =
    score >= 70 ? 'CRITICAL' : score >= 45 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW';

  return {
    score,
    severity,
    stats,
    sensitiveCharRatio,
    totalFindings: findings.length,
    totalMasked: findings.filter((f) => !f.dismissed).length,
    explanationLines,
  };
}

export const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: 'text-rose-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-amber-300',
  LOW: 'text-emerald-400',
};
