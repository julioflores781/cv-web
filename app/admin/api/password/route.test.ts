// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { adminReq, cookieValue, freshToken, PASSPHRASE, setCookies, startAdminApi } from '@/tests/helpers/admin-routes';
import { captureLogs } from '@/tests/helpers/capture-log';
import { adminSession } from '@/lib/api/admin';
import { GET, POST } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const NEXT = 'una frase nueva muy larga';
const body = (current: unknown, next: unknown) => ({ currentPassword: current, newPassword: next });
const call = (cookie: string | undefined, payload: unknown) => POST(adminReq('/admin/api/password/', { body: payload, ...(cookie === undefined ? {} : { cookie }) }));

async function boot(options: Parameters<typeof startAdminApi>[0] = {}) {
  const api = await startAdminApi(options);
  cleanups.push(api.restore);
  return { api, token: await freshToken(api) };
}

describe('POST /admin/api/password', () => {
  it('T267: a valid change is 200 with a single Set-Cookie holding the new token and its Max-Age; the old token stops working', async () => {
    const { api, token } = await boot();
    const response = await call(token, body(PASSPHRASE, NEXT));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const lines = setCookies(response);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/Max-Age=\d+/);
    const fresh = cookieValue(response) as string;
    expect(fresh).not.toBe(token);
    expect((await adminSession({ token: fresh, baseUrl: api.url })).kind).toBe('ok');
    expect((await adminSession({ token, baseUrl: api.url })).kind).toBe('problem');
  });

  it('T268: 403 keeps the cookie, 422 is ADMIN_WEAK_PASSWORD, 429 has retryAfterSeconds and a malformed body is 400 without calling the API', async () => {
    const { api, token } = await boot({ maxFailures: 2, lockMs: 600_000 });
    const wrong = await call(token, body('incorrecta', NEXT));
    expect(wrong.status).toBe(403);
    expect(await wrong.json()).toMatchObject({ code: 'ADMIN_CURRENT_PASSWORD_WRONG' });
    expect(setCookies(wrong)).toEqual([]);

    const weak = await call(token, body(PASSPHRASE, 'corta'));
    expect(weak.status).toBe(422);
    expect(await weak.json()).toMatchObject({ code: 'ADMIN_WEAK_PASSWORD' });
    expect(setCookies(weak)).toEqual([]);

    const before = api.requests.length;
    for (const payload of ['no json', {}, body(1, NEXT), body(PASSPHRASE, null), body('x'.repeat(1025), NEXT), []]) {
      const malformed = await call(token, payload);
      expect(malformed.status, JSON.stringify(payload)).toBe(400);
      expect(await malformed.json()).toMatchObject({ code: 'ADMIN_BAD_REQUEST' });
    }
    expect(api.requests).toHaveLength(before);

    await call(token, body('incorrecta', NEXT));
    const limited = await call(token, body(PASSPHRASE, NEXT));
    expect(limited.status).toBe(429);
    const limitedBody = (await limited.json()) as { code: string; retryAfterSeconds: number };
    expect(limitedBody.code).toBe('ADMIN_LOGIN_LOCKED');
    expect(limitedBody.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.headers.get('retry-after')).toBe(String(limitedBody.retryAfterSeconds));
  });

  it('T269: admin_password_change holds no password', async () => {
    const { token } = await boot();
    const logs = captureLogs();
    try {
      const response = await call(token, body(PASSPHRASE, NEXT));
      const events = logs.events('admin_password_change');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ outcome: 'ok', status: 200, request_id: response.headers.get('x-request-id') });
      const fresh = cookieValue(response) as string;
      for (const forbidden of [PASSPHRASE, NEXT, token, fresh, '203.0.113.7']) expect(logs.text()).not.toContain(forbidden);
    } finally {
      logs.restore();
    }
  });

  it('extra: without a cookie it is a 401 with no API call; GET is 405', async () => {
    const { api } = await boot();
    const before = api.requests.length;
    expect((await call(undefined, body(PASSPHRASE, NEXT))).status).toBe(401);
    expect(api.requests).toHaveLength(before);
    expect((await GET()).status).toBe(405);
  });
});
