// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { closedPortUrl, startServer, type TestServer } from '@/tests/helpers/http-server';
import { adminReq, cookieValue, FIELD, PASSPHRASE, setCookies, startAdminApi } from '@/tests/helpers/admin-routes';
import { captureLogs } from '@/tests/helpers/capture-log';
import { adminSession } from '@/lib/api/admin';
import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function boot(options: Parameters<typeof startAdminApi>[0] = {}) {
  const api = await startAdminApi(options);
  cleanups.push(api.restore);
  return api;
}
const login = (value: unknown, extra: Parameters<typeof adminReq>[1] = {}) => POST(adminReq('/admin/api/login/', { body: { [FIELD]: value }, ...extra }));

describe('POST /admin/api/login', () => {
  it('T258: a valid login is 200 {ok:true} without a token in the body, with the exact cookie, a request id, X-Client-IP and no CF-* toward the API', async () => {
    const api = await boot();
    const response = await login(PASSPHRASE);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: true });
    const token = cookieValue(response) as string;
    expect(token.length).toBeGreaterThan(10);
    expect(text).not.toContain(token);
    const lines = setCookies(response);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/HttpOnly/i);
    expect(lines[0]).toMatch(/SameSite=strict/i);
    expect(lines[0]).toMatch(/Path=\/admin(;|$)/);
    expect(lines[0]).toMatch(/Secure/i);
    expect(lines[0]).toMatch(/Max-Age=(\d+)/);
    expect(Number(/Max-Age=(\d+)/.exec(lines[0] as string)?.[1])).toBeGreaterThan(8 * 3600 - 60);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const sent = api.admin?.state.received.find((entry) => entry.path.endsWith('/auth/login'));
    expect(sent?.headers['x-client-ip']).toBe('203.0.113.7');
    expect(Object.keys(sent?.headers ?? {}).filter((name) => name.startsWith('cf-'))).toEqual([]);
    expect(sent?.headers['x-request-id']).toBe(response.headers.get('x-request-id'));
    expect((await adminSession({ token, baseUrl: api.url })).kind).toBe('ok');
  });

  it('T259: a non-JSON body, a missing or non-string password or one over 1024 characters is a 400 with the 401 message and 0 API calls', async () => {
    const api = await boot();
    const bodies: Array<Parameters<typeof adminReq>[1]> = [
      { body: 'not json' },
      { body: {} },
      { body: { [FIELD]: 12345 } },
      { body: { [FIELD]: 'x'.repeat(1025) } },
      { body: [] },
      { body: { [FIELD]: '' } },
    ];
    for (const options of bodies) {
      const response = await POST(adminReq('/admin/api/login/', options));
      expect(response.status, JSON.stringify(options)).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_INVALID_CREDENTIALS' });
      expect(setCookies(response)).toEqual([]);
    }
    expect(api.requests).toEqual([]);
  });

  it('T260: an API 401 is a 401 whose body equals the 400 one and sets no cookie', async () => {
    await boot();
    const wrong = await login('mala contraseña');
    expect(wrong.status).toBe(401);
    expect(setCookies(wrong)).toEqual([]);
    const bad = await POST(adminReq('/admin/api/login/', { body: 'no' }));
    const strip = (body: Record<string, unknown>) => ({ ...body, requestId: undefined });
    expect(strip((await wrong.json()) as Record<string, unknown>)).toEqual(strip((await bad.json()) as Record<string, unknown>));
  });

  it('T261: 429 LOCKED carries retryAfterSeconds and Retry-After; RATE_LIMITED has none; a junk Retry-After is dropped', async () => {
    const locked = await boot({ maxFailures: 1, lockMs: 900_000 });
    await login('mala');
    const response = await login(PASSPHRASE);
    expect(response.status).toBe(429);
    const body = (await response.json()) as { code: string; retryAfterSeconds: number };
    expect(body.code).toBe('ADMIN_LOGIN_LOCKED');
    expect(body.retryAfterSeconds).toBeGreaterThan(890);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(900);
    expect(response.headers.get('retry-after')).toBe(String(body.retryAfterSeconds));
    await locked.restore();
    cleanups.pop();

    const answers = [{ 'Retry-After': 'soon' }, {}] as const;
    let next = 0;
    const server: TestServer = await startServer((_req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/problem+json', ...answers[next++] });
      res.end(JSON.stringify({ code: 'ADMIN_LOGIN_RATE_LIMITED', title: 'x', status: 429 }));
    });
    cleanups.push(() => server.close());
    const saved = process.env.CV_API_URL;
    process.env.CV_API_URL = server.url;
    cleanups.push(async () => void (saved === undefined ? delete process.env.CV_API_URL : (process.env.CV_API_URL = saved)));
    for (let i = 0; i < 2; i += 1) {
      const limited = await login(PASSPHRASE);
      expect(limited.status).toBe(429);
      const limitedBody = (await limited.json()) as Record<string, unknown>;
      expect(limitedBody.code).toBe('ADMIN_LOGIN_RATE_LIMITED');
      expect(limitedBody).not.toHaveProperty('retryAfterSeconds');
      expect(limited.headers.get('retry-after')).toBeNull();
    }
  });

  it('T262: an API that is down, answers 500 or invalid JSON is 502 ADMIN_UPSTREAM; one that stays silent is 504 ADMIN_TIMEOUT; no URL, no cookie', async () => {
    const api = await boot();
    for (const mode of ['500', 'invalid-json'] as const) {
      api.admin?.inject('login', { mode });
      const response = await login(PASSPHRASE);
      const text = await response.text();
      expect(response.status, mode).toBe(502);
      expect(JSON.parse(text)).toMatchObject({ code: 'ADMIN_UPSTREAM' });
      expect(text).not.toContain(api.url);
      expect(text).not.toMatch(/127\.0\.0\.1/);
      expect(setCookies(response)).toEqual([]);
    }
    api.admin?.clearFaults();
    api.admin?.inject('login', { mode: 'silence' });
    const silent = await login(PASSPHRASE);
    expect(silent.status).toBe(504);
    expect(await silent.json()).toMatchObject({ code: 'ADMIN_TIMEOUT' });
    expect(setCookies(silent)).toEqual([]);

    const down = await closedPortUrl();
    process.env.CV_API_URL = down;
    const unreachable = await login(PASSPHRASE);
    expect(unreachable.status).toBe(502);
    const downText = await unreachable.text();
    expect(downText).not.toContain(down);
    expect(JSON.parse(downText)).toMatchObject({ code: 'ADMIN_UPSTREAM' });
  }, 30_000);

  it('T263: a foreign Origin is a 403 ADMIN_CSRF with 0 API calls', async () => {
    const api = await boot();
    const response = await login(PASSPHRASE, { origin: 'https://evil.example.test' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'ADMIN_CSRF' });
    expect(api.requests).toEqual([]);
  });

  it('T264: admin_login logs outcome, status and request_id and never the password, the token nor the IP', async () => {
    await boot({ maxFailures: 2, lockMs: 60_000 });
    const logs = captureLogs();
    try {
      const sentinel = 'SENTINEL-WRONG-secret-phrase';
      const bad = await login(sentinel);
      const good = await login(PASSPHRASE);
      const locked = await login(sentinel);
      const events = logs.events('admin_login');
      expect(events.map((event) => event.outcome)).toEqual(['invalid', 'ok', 'invalid']);
      expect(events.every((event) => typeof event.status === 'number' && /^[0-9a-f]{32}$/.test(String(event.request_id)))).toBe(true);
      expect(events[0]?.request_id).toBe(bad.headers.get('x-request-id'));
      const token = cookieValue(good) as string;
      for (const forbidden of [sentinel, PASSPHRASE, token, '203.0.113.7']) expect(logs.text()).not.toContain(forbidden);
      expect(locked.status).toBe(401);
    } finally {
      logs.restore();
    }
  });

  it('T291 (unit): other methods answer 405 with Allow: POST', async () => {
    for (const handler of [GET, PUT, PATCH, DELETE, OPTIONS]) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
  });

  it('extra: a password the API does not like is never echoed; the cookie is not Secure with an http SITE_URL', async () => {
    await boot();
    process.env.SITE_URL = 'http://localhost:3000';
    const response = await login(PASSPHRASE, { origin: 'http://localhost:3000', headers: { host: 'localhost:3000' } });
    expect(response.status).toBe(200);
    expect(setCookies(response)[0]).not.toMatch(/Secure/i);
  });
});
