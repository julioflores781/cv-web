// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { clearSession, readToken, sessionCookieOptions, applySession } from './session';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const IN_8H = '2026-11-12T20:00:00Z';
const saved = process.env.SITE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = saved;
});

function sink() {
  const calls: Array<{ name: string; value: string; options: object }> = [];
  return { calls, cookies: { set: (name: string, value: string, options: object) => void calls.push({ name, value, options }) } };
}
const reader = (value: string | undefined) => ({ get: () => (value === undefined ? undefined : { value }) });

describe('session cookie', () => {
  it('T249: https SITE_URL gives httpOnly, strict, /admin, secure and a maxAge from expiresAt; http drops secure; past or invalid expiry is refused', () => {
    process.env.SITE_URL = 'https://cv.example.test';
    expect(sessionCookieOptions(IN_8H, NOW)).toEqual({ httpOnly: true, sameSite: 'strict', path: '/admin', secure: true, maxAge: 8 * 3600 });
    process.env.SITE_URL = 'http://localhost:3000';
    expect(sessionCookieOptions(IN_8H, NOW)).toEqual({ httpOnly: true, sameSite: 'strict', path: '/admin', secure: false, maxAge: 8 * 3600 });
    expect(sessionCookieOptions('2026-11-12T11:00:00Z', NOW)).toBeNull();
    expect(sessionCookieOptions('2026-11-12T12:00:00Z', NOW)).toBeNull();
    expect(sessionCookieOptions('tomorrow', NOW)).toBeNull();
    const target = sink();
    expect(applySession(target, 'jwt-example', 'tomorrow', NOW)).toBe(false);
    expect(target.calls).toEqual([]);
    expect(applySession(target, 'jwt-example', IN_8H, NOW)).toBe(true);
    expect(target.calls).toHaveLength(1);
    expect(target.calls[0]?.value).toBe('jwt-example');
  });

  it('T250: clearing uses the same attributes with maxAge 0 and an empty value', () => {
    process.env.SITE_URL = 'https://cv.example.test';
    const target = sink();
    clearSession(target);
    const set = sink();
    applySession(set, 'jwt-example', IN_8H, NOW);
    expect(target.calls).toEqual([{ name: set.calls[0]?.name, value: '', options: { ...set.calls[0]?.options, maxAge: 0 } }]);
  });

  it('T251: readToken gives undefined for empty, spaced, control-character or oversized values and the value otherwise', () => {
    expect(readToken(reader(undefined))).toBeUndefined();
    expect(readToken(reader(''))).toBeUndefined();
    expect(readToken(reader('a b'))).toBeUndefined();
    expect(readToken(reader('a\u0000b'))).toBeUndefined();
    expect(readToken(reader('a\nb'))).toBeUndefined();
    expect(readToken(reader('x'.repeat(4097)))).toBeUndefined();
    expect(readToken(reader('x'.repeat(4096)))).toBe('x'.repeat(4096));
    expect(readToken(reader('aaa.bbb.ccc'))).toBe('aaa.bbb.ccc');
  });
});
