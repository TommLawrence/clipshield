/**
 * ClipShield — deterministic client-side redaction engine.
 *
 * PRIVACY CONTRACT (enforced here and verified by unit tests):
 *  - Redaction runs entirely in the browser, before any AI request is built.
 *  - The original input and the rehydration mapping live in a module-scoped
 *    in-memory vault only. They are never persisted, logged, or sent anywhere.
 *  - `clearVault()` wipes the mapping; `resetSession()` wipes everything.
 *  - Only `sanitize()` output (placeholder tokens) may be passed to Firebase
 *    AI Logic. Tests assert the sanitized text contains no original secrets.
 */

/** Categories of sensitive information ClipShield can detect. */
export type SensitiveCategory =
  | 'EMAIL'
  | 'PHONE'
  | 'IPV4'
  | 'API_KEY'
  | 'BEARER_TOKEN'
  | 'JWT'
  | 'GITHUB_TOKEN'
  | 'CLOUD_CREDENTIAL'
  | 'PRIVATE_KEY'
  | 'CUSTOM_TERM'
  | 'MANUAL_SELECTION';

export interface Finding {
  id: string;
  category: SensitiveCategory;
  /** The original sensitive value. Stays in browser memory only. */
  original: string;
  /** Deterministic placeholder token, e.g. `[EMAIL_1]`. */
  token: string;
  /** Character offsets of this finding in the ORIGINAL input. */
  start: number;
  end: number;
  /** Short human explanation shown in the UI. */
  reason: string;
  /** Whether the user has dismissed (un-masked) this finding. */
  dismissed?: boolean;
}

export interface SanitizeResult {
  /** The text with sensitive values replaced by placeholders. */
  sanitized: string;
  /** All findings, including dismissed ones (for the review UI). */
  findings: Finding[];
  /** The sanitized text with every finding (incl. dismissed) masked. */
  fullyMasked: string;
}

/**
 * In-memory rehydration vault. Module-scoped on purpose: nothing outside this
 * module can enumerate it, and it never leaves the browser tab.
 */
const vault = new Map<string, string>(); // token -> original

/** Original inputs per sanitization pass, kept for session reset only. */
let lastOriginalInput = '';

export function getVaultSize(): number {
  return vault.size;
}

/** Returns true if any ORIGINAL value still appears verbatim in `text`. */
export function containsAnyOriginal(text: string): boolean {
  for (const original of vault.values()) {
    if (original.length >= 3 && text.includes(original)) {
      return true;
    }
  }
  return false;
}

/** Wipes the rehydration vault. Original values are no longer recoverable. */
export function clearVault(): void {
  vault.clear();
}

/** Full session reset: forget the last original input and the vault. */
export function resetSession(): void {
  vault.clear();
  lastOriginalInput = '';
}

/**
 * Explicit, browser-only rehydration. Replaces tokens with originals in a
 * piece of text the USER chose. Never called automatically; never persisted.
 */
export function rehydrate(text: string): string {
  let out = text;
  for (const [token, original] of vault) {
    out = out.split(token).join(original);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Pattern catalog                                                     */
/* ------------------------------------------------------------------ */

interface PatternSpec {
  category: SensitiveCategory;
  regex: RegExp;
  reason: string;
  /** Normalize the matched original (e.g. trim punctuation). */
  normalize?: (m: string) => string;
}

/**
 * Lookaround guards. Written as regex literals (then `.source`-joined) to
 * avoid JS string-escape pitfalls: in a normal string '\d' is just 'd'.
 */
const START = /(?<![\w.+-])/;
const END = /(?![\w.+-])/;

function withGuards(body: RegExp, flags = 'g'): RegExp {
  return new RegExp(START.source + body.source + END.source, flags);
}

const PATTERNS: PatternSpec[] = [
  // Private keys first (multi-line blocks).
  {
    category: 'PRIVATE_KEY',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
    reason: 'PEM/OpenSSH private-key block',
  },
  // Bearer tokens (full "Bearer <credential>" span is the finding).
  {
    category: 'BEARER_TOKEN',
    regex: /\b[Bb]earer\s+[A-Za-z0-9\-._~+/]{16,}={0,2}/g,
    reason: 'Bearer authorization token',
  },
  // GitHub tokens (classic, fine-grained, OAuth, PAT prefixes).
  {
    category: 'GITHUB_TOKEN',
    regex: withGuards(
      /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{60,90}/,
    ),
    reason: 'GitHub access token (ghp_/gho_/ghu_/ghs_/ghr_ or github_pat_)',
  },
  // Generic API keys / access tokens with recognizable prefixes.
  {
    category: 'API_KEY',
    regex: withGuards(
      /sk-[A-Za-z0-9][A-Za-z0-9\-]{19,}|sk-proj-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16,}|ASIA[0-9A-Z]{16,}|AIza[0-9A-Za-z_\-]{35}|xox[baprs]-[A-Za-z0-9\-]{10,}|ya29\.[0-9A-Za-z_\-]{20,}|AGPA[A-Z0-9]{8,}|SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/,
    ),
    reason: 'API key / access token with a recognized provider prefix',
  },
  // Signed cloud secret-access-key style strings (40 chars, base64-ish).
  {
    category: 'CLOUD_CREDENTIAL',
    regex: withGuards(/[A-Za-z0-9/+=]{40}/),
    reason: 'Possible cloud secret access key (40-char base64-style string)',
  },
  // JWTs (three base64url segments starting with "eyJ" — shape match, user
  // review dismisses false hits).
  {
    category: 'JWT',
    regex: withGuards(/eyJ[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}/),
    reason: 'JSON Web Token (three-segment JWT)',
  },
  // IPv4 (not part of a longer dotted identifier like a version number).
  // End guard allows a sentence period but rejects a following digit
  // (so "1.2.3.4.5" does not match, "see 10.0.0.1." does).
  {
    category: 'IPV4',
    regex: new RegExp(
      START.source +
        '(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)' +
        '(?!\\.?\\d)',
      'g',
    ),
    reason: 'IPv4 address',
  },
  // International & NANP phone numbers incl. +256 and other +CC formats.
  // Requires separators (or a bare 9-12 digit run) so ticket IDs, versions,
  // dates and amounts do not trigger false positives.
  {
    category: 'PHONE',
    regex:
      /\+\d{1,3}[\s.-]?(?:\(\d{1,5}\)[\s.-]?)?(?:\d{1,5}[\s.-]){1,3}\d{2,6}(?:[\s.-]?(?:ext\.?|x|extension)\s?\d{2,6})?|\(\d{2,5}\)[\s.-]?\d{3}[\s.-]?\d{3,4}|\b\d{3}[\s.-]\d{3,4}\b|(?<![\w.-])\d{9,12}(?![\w.-])/g,
    reason: 'Phone number (incl. international formats)',
    normalize: (m) => m.trim(),
  },
  // Email addresses.
  {
    category: 'EMAIL',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    reason: 'Email address',
  },
];

/* ------------------------------------------------------------------ */
/* Core sanitization                                                   */
/* ------------------------------------------------------------------ */

interface RawHit {
  start: number;
  end: number;
  original: string;
  spec: PatternSpec;
}

/**
 * Detects every pattern hit, then resolves overlaps by preferring longer
 * matches (e.g. a Bearer token containing digits never becomes a PHONE hit).
 */
function collectHits(text: string, customTerms: string[]): RawHit[] {
  const hits: RawHit[] = [];

  for (const spec of PATTERNS) {
    const re = new RegExp(spec.regex.source, spec.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const original = spec.normalize ? spec.normalize(m[0]) : m[0];
      if (!original) continue;
      // If normalization trimmed characters, recompute offsets.
      const offset = m[0].indexOf(original);
      const start = m.index + (offset >= 0 ? offset : 0);
      const end = start + original.length;
      hits.push({ start, end, original, spec });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  }

  // Custom user terms (word-aware, case-insensitive).
  for (const term of customTerms) {
    if (!term.trim()) continue;
    const esc = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        original: m[0],
        spec: {
          category: 'CUSTOM_TERM',
          regex: re,
          reason: `Custom sensitive term: "${term.trim()}"`,
        },
      });
    }
  }

  // Resolve overlaps: longest match wins; ties break by earlier start.
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: RawHit[] = [];
  for (const hit of hits) {
    const overlaps = kept.some(
      (k) => hit.start < k.end && k.start < hit.end,
    );
    if (!overlaps) kept.push(hit);
  }
  // Stable order by position for token numbering.
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

/**
 * Sanitizes `text`. `customTerms` are user-defined terms to mask in addition
 * to the built-in patterns. Per-category counters keep tokens deterministic
 * across runs: `[EMAIL_1]`, `[EMAIL_2]`, `[SECRET_1]`, ...
 */
export function sanitize(
  text: string,
  customTerms: string[] = [],
): SanitizeResult {
  lastOriginalInput = text;
  const hits = collectHits(text, customTerms);
  const counters = new Map<SensitiveCategory, number>();
  const findings: Finding[] = [];

  // Build sanitized text right-to-left so offsets stay valid.
  const segments: string[] = [];
  let cursor = text.length;
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i];
    const n = (counters.get(hit.spec.category) ?? 0) + 1;
    counters.set(hit.spec.category, n);
    const token = `[${hit.spec.category}_${n}]`;
    vault.set(token, hit.original);
    findings.push({
      id: token,
      category: hit.spec.category,
      original: hit.original,
      token,
      start: hit.start,
      end: hit.end,
      reason: hit.spec.reason,
    });
    segments.unshift(text.slice(hit.end, cursor));
    segments.unshift(token);
    cursor = hit.start;
  }
  segments.unshift(text.slice(0, cursor));
  const sanitized = segments.join('');

  findings.reverse(); // restore document order for the UI

  const fullyMasked = applyDismissals(sanitized, findings, []).sanitized;
  return { sanitized, findings, fullyMasked };
}

/**
 * Re-applies the user's review decisions to an existing sanitized text.
 * `dismissedIds` are finding ids the user un-masked; `additions` are
 * { text } spans the user manually selected for masking in the preview.
 */
export function applyDismissals(
  sanitized: string,
  findings: Finding[],
  dismissedIds: string[],
  additions: { text: string; note?: string }[] = [],
): SanitizeResult {
  const dismissed = new Set(dismissedIds);
  let out = sanitized;
  const active = findings.filter((f) => !dismissed.has(f.id));
  // Replace token -> nothing? No: dismissal means restore original IN THE
  // PREVIEW ONLY is wrong. Dismissal means "this is not sensitive": the token
  // is replaced by the original value in the sanitized output.
  for (const f of findings) {
    if (dismissed.has(f.id)) {
      out = out.split(f.token).join(f.original);
    }
  }
  // Manual additions: mask selected spans with [MASKED_n] tokens.
  let maskCount = 0;
  for (const add of additions) {
    if (!add.text) continue;
    const token = `[MANUAL_SELECTION_${++maskCount}]`;
    vault.set(token, add.text);
    out = out.split(add.text).join(token);
    active.push({
      id: token,
      category: 'MANUAL_SELECTION',
      original: add.text,
      token,
      start: -1,
      end: -1,
      reason: add.note ?? 'Manually selected by user',
    });
  }
  return { sanitized: out, findings: active, fullyMasked: out };
}

/**
 * Security guard used before ANY AI call: returns false if any original
 * secret still appears in the text about to be sent out.
 */
export function assertNoOriginalsLeak(text: string): boolean {
  return !containsAnyOriginal(text);
}

/** Test-only helper: read the vault (never used by app runtime paths). */
export function __vaultDumpForTests(): ReadonlyMap<string, string> {
  return new Map(vault);
}

/** Test-only helper: peek at the retained original input. */
export function __lastOriginalForTests(): string {
  return lastOriginalInput;
}
