import { describe, expect, it } from 'vitest';
import vectors from '@/tests/fixtures/admin-validation-vectors.json';
import { ADMIN_MESSAGES, GENERIC_MESSAGE, adminMessage } from './messages';

const CONTRACT = [
  'ADMIN_UNAUTHORIZED', 'ADMIN_INVALID_CREDENTIALS', 'ADMIN_LOGIN_LOCKED', 'ADMIN_LOGIN_RATE_LIMITED', 'ADMIN_CURRENT_PASSWORD_WRONG', 'ADMIN_WEAK_PASSWORD',
  'BAD_REQUEST', 'NOT_FOUND', 'UNEXPECTED', 'CONTENT_INVALID', 'CONTENT_PARITY_BROKEN', 'CONTENT_TOO_LARGE', 'CONTENT_VERSION_CONFLICT', 'CONTENT_VERSION_NOT_FOUND',
  'IMAGE_INVALID', 'IMAGE_IN_USE', 'IMAGE_KEY_INVALID', 'IMAGE_NOT_FOUND', 'IMAGE_STORAGE_UNAVAILABLE', 'IMAGE_TOO_LARGE', 'IMAGE_UNSUPPORTED_TYPE',
  'ADMIN_CSRF', 'ADMIN_UPSTREAM', 'ADMIN_TIMEOUT', 'ADMIN_BAD_REQUEST', 'ADMIN_UNSUPPORTED_MEDIA', 'ADMIN_NOT_FOUND', 'ADMIN_INTERNAL',
];

function codesOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => codesOf(item, found));
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'code' && typeof item === 'string') found.add(item);
      else codesOf(item, found);
    }
  }
  return found;
}

describe('admin messages', () => {
  it('T257: every contract, web and violation code has a Spanish message; an unknown code gets the generic one', () => {
    const violations = [...codesOf(vectors)];
    expect(violations).toHaveLength(14);
    for (const code of [...CONTRACT, ...violations]) {
      const text = ADMIN_MESSAGES[code];
      expect(text, code).toBeTruthy();
      expect(adminMessage(code), code).toBe(text);
    }
    expect(adminMessage('SOMETHING_NEW')).toBe(GENERIC_MESSAGE);
    expect(adminMessage(undefined)).toBe(GENERIC_MESSAGE);
    expect(GENERIC_MESSAGE).toMatch(/[a-z]/);
  });
});
