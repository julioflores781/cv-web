// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { adminLogin, adminSession } from '@/lib/api/admin';
import { BROWSER_IP, bootAdmin, COOKIE, FIELD, loginToken, PASSPHRASE, registerCleanups, send } from '@/tests/helpers/admin-runtime';

registerCleanups();
const NEXT = 'una frase nueva muy larga';
const passwordBody = (current: string, next: string) => ({ currentPassword: current, newPassword: next });

describe('admin auth (standalone + fake admin API)', () => {
  it('T284: the login page is Spanish, has one h1, noindex, one labelled password field and no API data (and makes no API call)', async () => {
    const runtime = await bootAdmin();
    const reply = await send(runtime, '/admin/login/');
    expect(reply.status).toBe(200);
    const doc = new JSDOM(reply.text).window.document;
    expect(doc.documentElement.lang).toBe('es');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    const input = doc.querySelector('input[type="password"]');
    expect(input?.id).toBeTruthy();
    expect(doc.querySelector(`label[for="${input?.id}"]`)?.textContent).toBe('Contraseña');
    expect(reply.text).not.toMatch(/Ada|Ejemplo/);
    expect(runtime.api.requests).toEqual([]);
  }, 120_000);

  it('T285: a correct login opens /admin/ (200 with the cookie, 307 without); a wrong password is a generic 401', async () => {
    const runtime = await bootAdmin();
    const wrong = await send(runtime, '/admin/api/login/', { method: 'POST', body: { [FIELD]: 'mala' } });
    expect(wrong.status).toBe(401);
    expect(wrong.json()).toMatchObject({ code: 'ADMIN_INVALID_CREDENTIALS' });
    expect(wrong.cookie).toBeUndefined();
    const token = await loginToken(runtime);
    const panel = await send(runtime, '/admin/', { cookie: token });
    expect(panel.status).toBe(200);
    expect(new JSDOM(panel.text).window.document.querySelector('nav[aria-label="Principal"]')).not.toBeNull();
    expect((await send(runtime, '/admin/')).status).toBe(307);
  }, 120_000);

  it('T286: after logout-all the old token is sent to login?expired=1, which then clears the dead cookie with Path=/admin', async () => {
    const runtime = await bootAdmin();
    const token = await loginToken(runtime);
    expect((await send(runtime, '/admin/api/logout-all/', { method: 'POST', cookie: token, body: {} })).status).toBe(200);
    const gate = await send(runtime, '/admin/', { cookie: token });
    expect(gate.status).toBe(307);
    // The layout remembers the page (passed by the proxy), so the login comes back to it.
    expect(new URL(gate.headers.get('location') ?? '', runtime.server.url).href).toBe(`${runtime.server.url}/admin/login/?expired=1&next=%2Fadmin%2F`);
    const deep = await send(runtime, '/admin/messages/?before=2', { cookie: token, headers: { 'x-admin-path': 'https://evil.example/' } });
    expect(deep.status).toBe(307);
    expect(new URL(deep.headers.get('location') ?? '', runtime.server.url).href).toBe(`${runtime.server.url}/admin/login/?expired=1&next=${encodeURIComponent('/admin/messages/?before=2')}`);
    const login = await send(runtime, `/admin/login/?expired=1&next=${encodeURIComponent('/admin/messages/?before=2')}`, { cookie: token });
    expect(login.status).toBe(200);
    const cleared = login.headers.getSetCookie().find((line) => line.startsWith(`${COOKIE}=;`)) ?? '';
    expect(cleared).toMatch(/Path=\/admin/);
    expect(cleared).toMatch(/Max-Age=0/);
    expect(login.text).toContain('Tu sesión caducó');
  }, 120_000);

  it('T287: after changing the password the old token is invalid, the new one works and so does logging in with the new password', async () => {
    const runtime = await bootAdmin();
    const old = await loginToken(runtime);
    const changed = await send(runtime, '/admin/api/password/', { method: 'POST', cookie: old, body: passwordBody(PASSPHRASE, NEXT) });
    expect(changed.status).toBe(200);
    const fresh = changed.cookie as string;
    expect((await send(runtime, '/admin/', { cookie: old })).status).toBe(307);
    expect((await send(runtime, '/admin/', { cookie: fresh })).status).toBe(200);
    expect(await loginToken(runtime, NEXT)).toBeTruthy();
    const session = await adminSession({ token: fresh, baseUrl: runtime.api.url });
    expect(session.kind).toBe('ok');
  }, 120_000);

  it('T288: with an https SITE_URL the cookie is Secure and with an http one it is not; both are HttpOnly, SameSite=Strict, Path=/admin with a Max-Age', async () => {
    const attributes = async (site: string) => {
      const runtime = await bootAdmin({ site });
      const reply = await send(runtime, '/admin/api/login/', { method: 'POST', body: { [FIELD]: PASSPHRASE } });
      return reply.headers.getSetCookie()[0] ?? '';
    };
    const https = await attributes('https://cv.example.test');
    const http = await attributes('http://localhost:3000');
    for (const line of [https, http]) {
      expect(line).toMatch(/HttpOnly/i);
      expect(line).toMatch(/SameSite=strict/i);
      expect(line).toMatch(/Path=\/admin/);
      expect(line).toMatch(/Max-Age=\d+/);
    }
    expect(https).toMatch(/Secure/i);
    expect(http).not.toMatch(/Secure/i);
  }, 180_000);

  it('T289: a full tour (login, failure, lock, password change) leaves admin_* log lines and no password, token, IP, Authorization nor body', async () => {
    const runtime = await bootAdmin({ admin: { maxFailures: 3, lockMs: 60_000 } });
    const wrongSecret = 'SENTINEL-wrong-phrase-123';
    const token = await loginToken(runtime);
    await send(runtime, '/admin/api/password/', { method: 'POST', cookie: token, body: passwordBody(PASSPHRASE, NEXT) });
    for (let i = 0; i < 4; i += 1) await send(runtime, '/admin/api/login/', { method: 'POST', body: { [FIELD]: wrongSecret } });
    const log = runtime.server.log();
    const events = log.split('\n').filter((line) => line.includes('"event":"admin_')).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.event)).toEqual(expect.arrayContaining(['admin_login', 'admin_password_change']));
    expect(events.filter((event) => event.event === 'admin_login').map((event) => event.outcome)).toEqual(expect.arrayContaining(['ok', 'invalid']));
    for (const forbidden of [PASSPHRASE, NEXT, wrongSecret, token, BROWSER_IP, 'Authorization', 'Bearer', COOKIE]) expect(log, forbidden).not.toContain(forbidden);
  }, 120_000);

  it('T290: neither the HTML of the panel and the login page nor the JSON answers contain the token or the cookie name', async () => {
    const runtime = await bootAdmin();
    const login = await send(runtime, '/admin/api/login/', { method: 'POST', body: { [FIELD]: PASSPHRASE } });
    const token = login.cookie as string;
    const replies = [login, await send(runtime, '/admin/', { cookie: token }), await send(runtime, '/admin/login/'), await send(runtime, '/admin/settings/', { cookie: token }), await send(runtime, '/admin/api/logout/', { method: 'POST', cookie: token, body: {} })];
    for (const reply of replies) {
      expect(reply.text).not.toContain(token);
      expect(reply.text).not.toContain(COOKIE);
    }
    expect((await adminLogin(PASSPHRASE, { baseUrl: runtime.api.url })).kind).toBe('ok');
  }, 120_000);
});
