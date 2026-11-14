import { describe, expect, it } from 'vitest';
import { hasJsonBody, hasMultipartBody, isSameOrigin } from './csrf';

const SITE = 'https://cv.example.test';
const check = (headers: Record<string, string>) => isSameOrigin(new Headers(headers), SITE);

describe('csrf', () => {
  it('T252: an Origin equal to Host, SITE_URL or X-Forwarded-Host passes', () => {
    expect(check({ origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' })).toBe(true);
    expect(check({ origin: SITE, host: '0.0.0.0:3000' })).toBe(true);
    expect(check({ origin: 'https://panel.example.test', host: '0.0.0.0:3000', 'x-forwarded-host': 'panel.example.test' })).toBe(true);
  });

  it('T253: foreign, null, missing or cross/same-site requests are refused; no Origin but same-origin passes', () => {
    expect(check({ origin: 'https://evil.example.test', host: 'cv.example.test' })).toBe(false);
    expect(check({ origin: 'null', host: 'cv.example.test' })).toBe(false);
    expect(check({ origin: 'not a url', host: 'cv.example.test' })).toBe(false);
    expect(check({ host: 'cv.example.test' })).toBe(false);
    expect(check({ host: 'cv.example.test', 'sec-fetch-site': 'none' })).toBe(false);
    expect(check({ origin: SITE, 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(check({ origin: SITE, 'sec-fetch-site': 'same-site' })).toBe(false);
    expect(check({ origin: SITE, 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(check({ 'sec-fetch-site': 'same-origin' })).toBe(true);
  });

  it('content type helpers accept only JSON or multipart', () => {
    const type = (value: string) => new Headers({ 'content-type': value });
    expect(hasJsonBody(type('application/json'))).toBe(true);
    expect(hasJsonBody(type('Application/JSON; charset=utf-8'))).toBe(true);
    expect(hasJsonBody(type('text/plain'))).toBe(false);
    expect(hasJsonBody(type('application/x-www-form-urlencoded'))).toBe(false);
    expect(hasJsonBody(new Headers())).toBe(false);
    expect(hasMultipartBody(type('multipart/form-data; boundary=x'))).toBe(true);
    expect(hasMultipartBody(type('application/json'))).toBe(false);
  });
});
