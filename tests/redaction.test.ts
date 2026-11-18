import { describe, expect, it, beforeEach } from 'vitest';

import {
  applyDismissals,
  assertNoOriginalsLeak,
  clearVault,
  containsAnyOriginal,
  getVaultSize,
  rehydrate,
  resetSession,
  sanitize,
  __lastOriginalForTests,
  __vaultDumpForTests,
} from '@/lib/redaction';
import { assessExposure } from '@/lib/risk-engine';

const EMAIL = 'sarah.okafor@example-corp.example';
const PHONE = '+256 776 114 093';
const IPV4 = '10.24.117.8';
const API_KEY = 'sk-test-9fJ2mQ7bXr4LpN8vZa3Wq6yT';
const BEARER = 'Bearer dGhpcy1pcy1hLWRhbmdlcm91cy10b2tlbg==';
const GITHUB = 'ghp_fakeGitHubTokenForDemoPurposesOnly1234567890';
const AWS_KEY = 'AKIAIOSFODNN7FLEXAMPLE';
const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

beforeEach(() => {
  resetSession();
});

describe('pattern detection', () => {
  it('detects and masks an email address', () => {
    const { sanitized, findings } = sanitize(`Contact ${EMAIL} about the ticket.`);
    expect(sanitized).toBe('Contact [EMAIL_1] about the ticket.');
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('EMAIL');
  });

  it('detects international phone numbers including +256', () => {
    const { sanitized, findings } = sanitize(`Call me at ${PHONE} today.`);
    expect(sanitized).toContain('[PHONE_1]');
    expect(findings[0].category).toBe('PHONE');
    expect(sanitized).not.toContain('776');
  });

  it('detects IPv4 addresses', () => {
    const { sanitized, findings } = sanitize(`Gateway is ${IPV4} on VLAN 44.`);
    expect(sanitized).toBe('Gateway is [IPV4_1] on VLAN 44.');
    expect(findings[0].category).toBe('IPV4');
  });

  it('does not mistake version numbers for IPv4', () => {
    const { sanitized } = sanitize('Installed client v7.2.1 and firmware 1.2.3.4.5.');
    expect(sanitized).toBe('Installed client v7.2.1 and firmware 1.2.3.4.5.');
  });

  it('detects API keys with recognized prefixes', () => {
    const { sanitized, findings } = sanitize(`key=${API_KEY}`);
    expect(sanitized).toContain('[API_KEY_1]');
    expect(findings.some((f) => f.category === 'API_KEY')).toBe(true);
  });

  it('detects AWS-style access key ids', () => {
    const { sanitized, findings } = sanitize(`AKID ${AWS_KEY} leaked`);
    expect(sanitized).toContain('[API_KEY_1]');
    expect(findings[0].category).toBe('API_KEY');
  });

  it('detects bearer tokens, masking the whole credential span', () => {
    const { sanitized, findings } = sanitize(`Authorization: ${BEARER}`);
    expect(sanitized).toBe('Authorization: [BEARER_TOKEN_1]');
    expect(findings[0].category).toBe('BEARER_TOKEN');
    expect(findings[0].original).toMatch(/^Bearer /i);
    expect(sanitized).not.toContain('dGhpcy');
  });

  it('detects GitHub tokens', () => {
    const { sanitized, findings } = sanitize(`token: ${GITHUB}`);
    expect(sanitized).toContain('[GITHUB_TOKEN_1]');
    expect(findings[0].category).toBe('GITHUB_TOKEN');
  });

  it('detects JWTs', () => {
    const { sanitized, findings } = sanitize(`auth header: ${JWT}`);
    expect(sanitized).toContain('[JWT_1]');
    expect(findings[0].category).toBe('JWT');
  });

  it('detects private key blocks', () => {
    const pem =
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7f3X\n-----END RSA PRIVATE KEY-----';
    const { sanitized, findings } = sanitize(`leaked:\n${pem}\nbye`);
    expect(sanitized).toContain('[PRIVATE_KEY_1]');
    expect(findings[0].category).toBe('PRIVATE_KEY');
    expect(sanitized).not.toContain('MIIEowIBAAKCAQEA7f3X');
  });

  it('detects UK-style and bare international phone formats', () => {
    const uk = sanitize('Ring +44 20 7946 0302 now');
    expect(uk.sanitized).not.toContain('7946');
    expect(uk.findings.some((f) => f.category === 'PHONE')).toBe(true);

    const bare = sanitize('callback 776114093 asap');
    expect(bare.sanitized).not.toContain('776114093');
  });

  it('does not mistake dates, versions or ticket ids for phones', () => {
    const noise = sanitize(
      'On 2026-11-12 client v7.2.1 ticket #48211 PO 77120 INC-0091 EUR 1,284,000',
    );
    expect(noise.findings.filter((f) => f.category === 'PHONE')).toHaveLength(0);
    expect(noise.sanitized).toContain('2026-11-12');
    expect(noise.sanitized).toContain('v7.2.1');
    expect(noise.sanitized).toContain('#48211');
  });

  it('detects IPv4 followed by sentence punctuation', () => {
    const { sanitized } = sanitize('Gateway 10.24.117.8. Colleague reports no issues.');
    expect(sanitized).toContain('[IPV4_1]');
    expect(sanitized).not.toContain('10.24.117.8');
  });

  it('masks custom user terms case-insensitively', () => {
    const { sanitized, findings } = sanitize('Project Aurora budget is confidential.', [
      'project aurora',
    ]);
    expect(sanitized).not.toMatch(/project aurora/i);
    expect(findings.some((f) => f.category === 'CUSTOM_TERM')).toBe(true);
  });

  it('numbers tokens deterministically per category', () => {
    const { sanitized } = sanitize(
      `${EMAIL} and bob@example.test and also carol@example.test`,
    );
    expect(sanitized).toContain('[EMAIL_1]');
    expect(sanitized).toContain('[EMAIL_2]');
    expect(sanitized).toContain('[EMAIL_3]');
  });

  it('prefers the longest match when patterns overlap', () => {
    // A GitHub token contains digits that could look like a phone number.
    const { sanitized, findings } = sanitize(`token ${GITHUB} end`);
    expect(findings).toHaveLength(1);
    expect(sanitized).toBe('token [GITHUB_TOKEN_1] end');
  });
});

describe('user review controls', () => {
  it('un-masking a finding restores the original in the preview output', () => {
    const { sanitized, findings } = sanitize(`Contact ${EMAIL} now.`);
    const emailFinding = findings.find((f) => f.category === 'EMAIL')!;
    const reviewed = applyDismissals(sanitized, findings, [emailFinding.id]);
    expect(reviewed.sanitized).toContain(EMAIL);
    expect(reviewed.sanitized).not.toContain('[EMAIL_1]');
  });

  it('manual masks create MANUAL_SELECTION tokens and hide the text', () => {
    const { sanitized, findings } = sanitize('Employee ID 4417 called twice.');
    const reviewed = applyDismissals(sanitized, findings, [], [
      { text: 'Employee ID 4417' },
    ]);
    expect(reviewed.sanitized).not.toContain('Employee ID 4417');
    expect(reviewed.sanitized).toContain('[MANUAL_SELECTION_1]');
  });
});

describe('security boundaries', () => {
  it('sanitized output contains no original secrets', () => {
    const corpus = [
      `From: ${EMAIL}`,
      `Phone: ${PHONE}`,
      `IP: ${IPV4}`,
      `Key: ${API_KEY}`,
      `Auth: ${BEARER}`,
      `GH: ${GITHUB}`,
      `AWS: ${AWS_KEY}`,
      `JWT: ${JWT}`,
    ].join('\n');
    const { sanitized } = sanitize(corpus);
    const secrets = [EMAIL, PHONE, IPV4, API_KEY, 'dGhpcy1pcy1hLWRhbmdlcm91cy10b2tlbg==', GITHUB, AWS_KEY, JWT];
    for (const s of secrets) {
      expect(sanitized).not.toContain(s);
    }
  });

  it('assertNoOriginalsLeak blocks text that still contains an original', () => {
    sanitize(`Email ${EMAIL}`);
    expect(assertNoOriginalsLeak(`re-injected ${EMAIL}`)).toBe(false);
    expect(assertNoOriginalsLeak('totally clean [EMAIL_1] text')).toBe(true);
  });

  it('containsAnyOriginal detects vault values in arbitrary text', () => {
    sanitize(`Email ${EMAIL} phone ${PHONE}`);
    expect(containsAnyOriginal(`someone pasted ${PHONE}`)).toBe(true);
  });

  it('vault maps tokens back to originals and clears on demand', () => {
    sanitize(`Email ${EMAIL}`);
    const vault = __vaultDumpForTests();
    expect(vault.get('[EMAIL_1]')).toBe(EMAIL);
    expect(getVaultSize()).toBeGreaterThanOrEqual(1);
    clearVault();
    expect(getVaultSize()).toBe(0);
  });

  it('rehydrate restores tokens only after explicit request', () => {
    const { sanitized } = sanitize(`Email ${EMAIL}`);
    expect(rehydrate(sanitized)).toContain(EMAIL);
    expect(rehydrate('[EMAIL_1] [PHONE_9] unknown tokens stay')).toContain('[PHONE_9]');
  });

  it('resetSession wipes the retained original input', () => {
    sanitize(`secret corpus ${EMAIL}`);
    expect(__lastOriginalForTests()).toContain('secret corpus');
    resetSession();
    expect(__lastOriginalForTests()).toBe('');
    expect(getVaultSize()).toBe(0);
  });

  it('sanitized output of a dismissed finding is correctly flagged by the leak guard', () => {
    const { sanitized, findings } = sanitize(`Email ${EMAIL}`);
    const f = findings[0];
    const reviewed = applyDismissals(sanitized, findings, [f.id]);
    // User explicitly un-masked it — the guard must now flag it so the app
    // can warn before sending.
    expect(assertNoOriginalsLeak(reviewed.sanitized)).toBe(false);
  });
});

describe('exposure scoring (deterministic)', () => {
  it('produces the same score for the same input', () => {
    const a = assessExposure(sanitize(`Email ${EMAIL}`).findings, 100);
    const b = assessExposure(sanitize(`Email ${EMAIL}`).findings, 100);
    expect(a.score).toBe(b.score);
  });

  it('scores credentials higher than contact info', () => {
    const contact = assessExposure(sanitize(`Email ${EMAIL}`).findings, 100);
    const creds = assessExposure(
      sanitize(`Key ${API_KEY} and ${GITHUB}`).findings,
      100,
    );
    expect(creds.score).toBeGreaterThan(contact.score);
  });

  it('is explainable: every contributing category appears in the math', () => {
    const { findings } = sanitize(`Email ${EMAIL} phone ${PHONE} ip ${IPV4}`);
    const assessment = assessExposure(findings, 200);
    expect(assessment.explanationLines.length).toBeGreaterThanOrEqual(3);
    expect(assessment.stats.map((s) => s.category)).toEqual(
      expect.arrayContaining(['EMAIL', 'PHONE', 'IPV4']),
    );
  });

  it('caps the score at 100', () => {
    const everything = [
      EMAIL,
      PHONE,
      IPV4,
      API_KEY,
      BEARER,
      GITHUB,
      AWS_KEY,
      JWT,
      '-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----',
    ].join(' ');
    const assessment = assessExposure(sanitize(everything).findings, everything.length);
    expect(assessment.score).toBeLessThanOrEqual(100);
    expect(assessment.severity).toBe('CRITICAL');
  });
});

describe('sample scenarios are fully fictional and detectable', () => {
  it('each sample gets multiple redaction categories', async () => {
    const { SAMPLE_SCENARIOS } = await import('@/lib/samples');
    for (const sample of SAMPLE_SCENARIOS) {
      const { findings } = sanitize(sample.content, ['Project Aurora']);
      const categories = new Set(findings.map((f) => f.category));
      expect(
        categories.size,
        `${sample.id} should exercise multiple categories`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});
