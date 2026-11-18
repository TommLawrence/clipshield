# ClipShield

**A privacy-first hybrid AI workspace for safely preparing sensitive workplace information for AI-assisted analysis.**

> Sanitize first. Route consciously. Make privacy observable.

ClipShield sits between you and generative AI. It detects and masks sensitive
information **entirely in your browser**, then uses **Firebase AI Logic hybrid
inference** to run analysis on-device when possible, with explicit, consented
cloud fallback. It shows you exactly where each inference call executed.

Built for the **Google #BuildHybridAI 2026 hackathon** (submission period
November 11–30, 2026).

---

## ⚠️ Honest scope statement

ClipShield is a hackathon prototype, **not** a certified security product:

- Detection is **best-effort, deterministic pattern matching** — it will miss
  sensitive values that don't match known patterns (e.g. free-text home
  addresses, unusual credential formats) and may produce false positives.
  The redaction preview exists precisely because **human review is required**.
- ClipShield is not a Zero-Trust platform and makes no claim of perfect PII
  detection.
- On-device inference requires a supported Chrome desktop browser (see
  [Browser requirements](#browser-requirements-for-on-device-inference)).

---

## What it does

1. **Local privacy airlock** — a deterministic, client-side redaction engine
   (`src/lib/redaction.ts`) detects emails, phone numbers (incl. international
   formats like +256), IPv4 addresses, API keys, bearer tokens, JWTs, GitHub
   tokens, cloud credentials, private-key blocks, user-defined terms and
   manually selected text. Sensitive values are replaced with reversible
   placeholders such as `[EMAIL_1]`, `[PHONE_1]`, `[SECRET_1]`. The mapping
   between tokens and originals lives in an in-memory vault that never leaves
   the browser tab.
2. **Deterministic exposure scoring** (`src/lib/risk-engine.ts`) — an
   explainable score computed from detected categories, counts and density,
   with the formula shown in the UI. Not an AI-generated risk score.
3. **Firebase AI Logic hybrid inference** (`src/lib/hybrid-ai.ts`) — three
   genuine inference modes (details below).
4. **Hybrid routing inspector** — displays model readiness, the *actual*
   inference source reported by `result.response.inferenceSource`, execution
   latency, fallback status and masked-entity count. Nothing is fabricated.

## Inference modes

| Mode | Firebase AI Logic config | Behaviour |
| --- | --- | --- |
| **Local-first Hybrid Brief** | `InferenceMode.PREFER_ON_DEVICE` (on-device: Gemini Nano via Chrome's Prompt API; cloud fallback: `gemini-4-hydrogen`) | Produces a brief on-device when available. The user is informed up front and must consent to automatic cloud fallback before the run. If local inference is unavailable, Firebase AI Logic falls back to the cloud model and the UI reports `IN_CLOUD` plus a fallback notice. |
| **Local-only Private Brief** | `InferenceMode.ONLY_ON_DEVICE` | Strictly on-device. **Fails closed** — if the Prompt API is missing or the model is not available, the run is refused with a clear message and *never* falls back to the cloud. |
| **Deep Cloud Synthesis** | `InferenceMode.ONLY_IN_CLOUD` with `gemini-4-hydrogen` | Full structured analysis (executive summary, findings, risk matrix, action items, operational considerations, verification areas). Requires explicit confirmation before the sanitized content is sent to cloud inference. |

### Correct model initialization

The on-device model is **never** downloaded on page mount. `getGenerativeModel()`
creates the model instance; `initializeDeviceModel()` is called only after a
genuine user gesture (the **Prepare Local AI** button), with download progress
shown where Chrome provides it.

### Fail-closed defense (important)

In firebase JS SDK 13.4.0, when `window.LanguageModel` is absent the SDK
creates no Chrome adapter, and a hybrid-configured call silently executes in
the cloud — even for `ONLY_ON_DEVICE`. ClipShield therefore probes
`window.LanguageModel.availability()` itself before local-only runs and
refuses to execute when on-device inference is not confirmed. Local-only
results are also discarded unless the SDK actually reports
`inferenceSource === 'on_device'`.

## Architecture

```
src/
├── app/                    # Next.js App Router (single-page workspace)
│   ├── layout.tsx
│   ├── page.tsx            # Workspace composition & state
│   └── globals.css         # Tailwind 4 theme (obsidian/emerald/indigo)
├── components/             # UI components
│   ├── ui.tsx              # Design-system primitives
│   ├── InputWorkspace.tsx  # Paste + sample scenarios
│   ├── PrivacyInspection.tsx # Findings, categories, exposure score
│   ├── RedactionPreview.tsx  # Original vs sanitized, manual masking
│   ├── InferenceControls.tsx # Three modes, consent, Prepare Local AI
│   ├── RoutingInspector.tsx  # Actual inference source, latency, history
│   └── AnalysisResults.tsx   # Report display, explicit local rehydration
└── lib/
    ├── firebase.ts         # App init, App Check (reCAPTCHA v3), anon auth, Firestore
    ├── redaction.ts        # Deterministic local redaction + in-memory vault
    ├── hybrid-ai.ts        # Firebase AI Logic hybrid inference layer
    ├── risk-engine.ts      # Deterministic exposure assessment
    ├── telemetry.ts        # Coarse, non-sensitive metrics (opt-in infra)
    ├── samples.ts          # Four fictional demo scenarios
    └── categories.ts       # Shared category labels
firestore.rules             # Strict UID-scoped rules (see below)
tests/redaction.test.ts     # Vitest unit tests incl. security boundaries
```

### Privacy safeguards (enforced + tested)

- All redaction happens in the browser before any AI request is built.
- The original input and the rehydration mapping are kept in browser memory
  only — never persisted to Firestore, never sent to cloud inference, never
  logged, never included in telemetry. `resetSession()` wipes them.
- The AI execution layer (`hybrid-ai.ts`) accepts sanitized content only, and
  re-runs the leak guard (`assertNoOriginalsLeak`) as defense in depth before
  every request.
- Restoring original values in a report is **explicitly requested by the user**
  and performed entirely in the browser.
- Telemetry (if enabled) records only: mode, outcome, latency bucket
  (250 ms granularity), masked count, and category *names*. No content.
- Unit tests assert that sanitized output contains no original secrets and
  that the vault clears on demand.

### Firestore rules

`firestore.rules` restricts writes to `users/{uid}/reports/**` (sanitized
report text only, UID-scoped) with a content backstop that rejects obvious
credential patterns, and allows create-only coarse `telemetry` records with a
fixed key whitelist. All other paths are denied.

## Setup

```bash
git clone <repo-url> && cd clipshield
npm install
cp .env.example .env.local   # fill in your Firebase web app config
npm run dev                  # http://localhost:3000
```

### Firebase configuration

ClipShield expects an **existing** Firebase project with:

- A registered **Web app** — copy its config values into `.env.local`
  (see `.env.example`).
- **App Check** with a reCAPTCHA v3 site key registered for the web app
  (`NEXT_PUBLIC_RECAPTCHA_SITE_KEY`). In development without a site key the
  app falls back to Google's public test key (console warning).
- **Anonymous Authentication** enabled (for the optional saved-reports and
  telemetry features).
- The **Gemini API enabled** (Google AI) so Firebase AI Logic requests work.
- Optional: Firestore (Native mode) if you use saved reports/telemetry; deploy
  `firestore.rules` with `firebase deploy --only firestore:rules`.

No Firebase Admin credentials or service accounts are needed.

## Browser requirements (for on-device inference)

| Requirement | Detail |
| --- | --- |
| Browser | **Chrome desktop 139 or newer** |
| API | Chrome's built-in Prompt API (`window.LanguageModel`), serving **Gemini Nano** |
| OS / hardware | 64-bit desktop OS, sufficient free disk (~a few GB for the model), 22 GB+ RAM recommended on some platforms for the built-in model |
| First run | The model downloads on first use — click **Prepare Local AI**; progress is displayed where Chrome reports it |

Without this environment, Local-first mode will use cloud fallback (with your
consent) and Local-only mode will correctly fail closed. Cloud mode works in
any modern browser.

## Verification

```bash
npm test        # 30 vitest unit tests: detection, review controls, security boundaries
npm run build   # production build (Next.js 16 + TypeScript, strict)
npm start       # serve the production build
```

Manual verification checklist (what we tested):

1. ✅ Sensitive pattern detection and redaction across all four sample scenarios.
2. ✅ User editing: un-masking findings, custom terms, manual masking.
3. ✅ Sanitized output contains no original values (unit-tested + verified in
   the running app); AI layer re-checks before every request.
4. ✅ `PREFER_ON_DEVICE` config present; genuine on-device execution could not
   be verified in the headless test environment (no Prompt API) — see
   "Verification honesty" below.
5. ✅ Genuine cloud fallback path (SDK code path inspected; live run requires
   Firebase config + network).
6. ✅ `ONLY_ON_DEVICE` fails closed without cloud fallback (verified in the
   running app: run refused, clear message shown).
7. ✅ `ONLY_IN_CLOUD` uses `gemini-4-hydrogen` (verified via build + code
   inspection; live run requires Firebase config).
8. ✅ Inference-source reporting only ever displays what
   `result.response.inferenceSource` returns; no fabricated telemetry.
9. ✅ App Check initialized before AI requests; works with the existing
   reCAPTCHA config.
10. ✅ Firestore rules provided and reviewed.
11. ✅ Production build and runtime verified (server started, workspace
    exercised end-to-end with a headless browser).

### Verification honesty

- **Verified by automated tests:** redaction detection, overlap resolution,
  review controls, leak guards, vault lifecycle, deterministic scoring,
  sample coverage (30 passing tests).
- **Verified in the running app (headless Chromium):** sample loading, live
  redaction preview, manual masking, local-only fail-closed refusal, hybrid
  consent enforcement, UI rendering without console errors.
- **NOT verified live:** actual `ON_DEVICE` inference (the sandbox has no
  Chrome Prompt API / Gemini Nano) and live cloud calls (no Firebase project
  credentials in the sandbox). The Firebase AI Logic call sites are genuine
  and the SDK routing logic was verified against the firebase 13.4.0 source.
  On-device execution must be re-verified on Chrome 139+ desktop hardware.

## Hackathon disclosure

Created during the November 11–30, 2026 #BuildHybridAI submission period:

- All application code (`src/**`, `tests/**`, rules, docs) was written during
  the hackathon window.
- Pre-existing material reused: the `create-next-app` scaffold (Next.js 16,
  TypeScript, Tailwind CSS 4 baseline), and the Firebase JS SDK (v13.4.0) as a
  dependency. No other starter code was used.

## Demo script (3 minutes)

1. Paste the **Security Incident Report** sample (or your own text) — show the
   privacy inspection: entities found, categories, exposure score and its
   math.
2. Scroll to the redaction preview — show original vs sanitized; un-mask a
   false positive; add a manual mask.
3. Click **Prepare Local AI** (shows the model only downloads on demand).
4. Run **Local-only Private Brief** — point at the routing inspector showing
   the actual source (on-device on supported Chrome, or the fail-closed
   refusal otherwise).
5. Enable consent and run **Local-first Hybrid Brief** — show `ON_DEVICE` or
   the fallback notice with `IN_CLOUD`.
6. Run **Deep Cloud Synthesis** — show the structured report and "Restore
   original values (local only)" toggling placeholders.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
