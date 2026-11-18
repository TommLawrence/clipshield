/** Shared category labels for the UI. */
import type { SensitiveCategory } from './redaction';

export const CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  IPV4: 'IPv4 address',
  API_KEY: 'API key',
  BEARER_TOKEN: 'Bearer token',
  JWT: 'JWT',
  GITHUB_TOKEN: 'GitHub token',
  CLOUD_CREDENTIAL: 'Cloud credential',
  PRIVATE_KEY: 'Private key',
  CUSTOM_TERM: 'Custom term',
  MANUAL_SELECTION: 'Manual selection',
};
