// @vitest-environment node
import { NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminReq, COOKIE, setCookies, SITE } from '@/tests/helpers/admin-routes';
import { adminRoute } from './handler';

const saved = process.env.SITE_URL;
afterEach(() => {
  vi.restoreAllMocks();
  if (saved === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = saved;
});
process.env.SITE_URL = SITE;

describe('adminRoute', () => {
  it('T254: text/plain or a simple form is a 415 on a mutation (multipart only where allowed); a GET needs no Origin', async () => {
    const inner = vi.fn(() => NextResponse.json({ ok: true }));
    const post = adminRoute({ mutating: true, auth: false }, inner);
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', null]) {
      const response = await post(adminReq('/admin/api/x/', { contentType, body: 'a=b' }));
      expect(response.status, String(contentType)).toBe(415);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_UNSUPPORTED_MEDIA' });
    }
    expect(inner).not.toHaveBeenCalled();

    const upload = adminRoute({ mutating: true, auth: false, media: 'multipart' }, inner);
    expect((await upload(adminReq('/admin/api/x/', { contentType: 'multipart/form-data; boundary=x', body: 'x' }))).status).toBe(200);
    expect((await upload(adminReq('/admin/api/x/', { origin: 'https://evil.example.test', contentType: 'multipart/form-data; boundary=x', body: 'x' }))).status).toBe(403);

    const get = adminRoute({ mutating: false, auth: false }, inner);
    expect((await get(adminReq('/admin/api/x/', { method: 'GET', origin: null, contentType: null }))).status).toBe(200);
  });

  it('T255: no cookie is a 401; an API 401 clears the cookie; a 403 wrong-password leaves it alone', async () => {
    const inner = vi.fn(() => NextResponse.json({ ok: true }));
    const guarded = adminRoute({ mutating: true, auth: true }, inner);
    const none = await guarded(adminReq('/admin/api/x/', { body: {} }));
    expect(none.status).toBe(401);
    expect(await none.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    expect(inner).not.toHaveBeenCalled();

    const { failure } = await import('./handler');
    const problem = (status: number, code: string) => ({ kind: 'problem' as const, status, code, title: '', requestId: 'a'.repeat(32) });
    const expired = adminRoute({ mutating: true, auth: true }, (ctx) => failure(ctx, problem(401, 'ADMIN_UNAUTHORIZED')));
    const response = await expired(adminReq('/admin/api/x/', { body: {}, cookie: 'old.token' }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    const [cleared] = setCookies(response);
    expect(cleared).toContain(`${COOKIE}=;`);
    expect(cleared).toMatch(/Max-Age=0/);

    const wrong = adminRoute({ mutating: true, auth: true }, (ctx) => failure(ctx, problem(403, 'ADMIN_CURRENT_PASSWORD_WRONG')));
    const forbidden = await wrong(adminReq('/admin/api/x/', { body: {}, cookie: 'good.token' }));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ code: 'ADMIN_CURRENT_PASSWORD_WRONG' });
    expect(setCookies(forbidden)).toEqual([]);
  });

  it('T256: an unexpected exception is a 500 ADMIN_INTERNAL without trace; every response carries no-store and X-Request-Id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = adminRoute({ mutating: true, auth: false }, () => {
      throw new Error('secret-internal-detail at /srv/app.ts:1');
    });
    const response = await boom(adminReq('/admin/api/x/', { body: {} }));
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ code: 'ADMIN_INTERNAL' });
    expect(text).not.toMatch(/secret-internal-detail|app\.ts|stack/);
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f]{32}$/);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const ok = await adminRoute({ mutating: false, auth: false }, () => NextResponse.json({ ok: true }))(adminReq('/admin/api/x/', { method: 'GET', contentType: null }));
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(ok.headers.get('x-request-id')).toMatch(/^[0-9a-f]{32}$/);
    const csrf = await boom(adminReq('/admin/api/x/', { origin: null, body: {} }));
    expect(csrf.status).toBe(403);
    expect(await csrf.json()).toMatchObject({ code: 'ADMIN_CSRF' });
    expect(csrf.headers.get('cache-control')).toBe('no-store');
  });
});
