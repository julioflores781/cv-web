// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from './proxy';

const COOKIE = 'cv_admin_token';
const call = (path: string, init: { cookie?: string; method?: string; headers?: Record<string, string> } = {}) =>
  proxy(
    new NextRequest(`http://localhost:3000${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(init.cookie === undefined ? {} : { cookie: `${COOKIE}=${init.cookie}` }), ...init.headers },
    }),
  );
const passes = (response: Response) => response.headers.get('x-middleware-next') === '1';
/** Path and query of the redirect target (the header holds an absolute URL on the request's own origin). */
const location = (response: Response) => {
  const target = response.headers.get('location');
  if (target === null) return null;
  const url = new URL(target);
  expect(url.origin).toBe('http://localhost:3000');
  return `${url.pathname}${url.search}`;
};

describe('proxy', () => {
  it('config: one matcher for /admin and everything below it except the image handlers (their bodies must not be buffered for the proxy)', () => {
    expect(config).toEqual({ matcher: ['/admin', '/admin/((?!api/images(?:/|$)).*)'] });
    const covered = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    for (const url of ['/admin', '/admin/', '/admin/login/', '/admin/images/', '/admin/projects/?x=1', '/admin/api/login/', '/admin/api/content/projects/', '/admin/api/imagesx/', '/admin/zzz']) {
      expect(covered(url), url).toBe(true);
    }
    for (const url of ['/admin/api/images', '/admin/api/images/', '/admin/api/images/cleanup/', '/admin/api/images/00000000-0000-4000-8000-000000000001/']) {
      expect(covered(url), url).toBe(false);
    }
    for (const url of ['/', '/servicios/', '/en/', '/api/contact/', '/administrar/']) expect(covered(url), url).toBe(false);
  });

  it('T242: /admin/ without a cookie redirects to the login with next', () => {
    const response = call('/admin/');
    expect(response.status).toBe(307);
    expect(location(response)).toBe('/admin/login/?next=%2Fadmin%2F');
  });

  it('T243: /admin/projects/?x=1 without a cookie keeps path and query in next', () => {
    const response = call('/admin/projects/?x=1');
    expect(location(response)).toBe(`/admin/login/?next=${encodeURIComponent('/admin/projects/?x=1')}`);
  });

  it('T244: the login (with and without slash) and POST /admin/api/login/ pass without a cookie', () => {
    expect(passes(call('/admin/login/'))).toBe(true);
    expect(passes(call('/admin/login'))).toBe(true);
    expect(passes(call('/admin/api/login/', { method: 'POST' }))).toBe(true);
  });

  it('T245: any other /admin/api/* without a cookie is a 401 JSON, not a redirect', async () => {
    for (const path of ['/admin/api/password/', '/admin/api/content/services/', '/admin/api/logout']) {
      const response = call(path, { method: 'POST' });
      expect(response.status, path).toBe(401);
      expect(location(response)).toBeNull();
      expect(await response.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    }
  });

  it('T246: with a cookie /admin/ passes, the login redirects to /admin/ and ?expired=1 passes and clears it with Path=/admin', () => {
    expect(passes(call('/admin/', { cookie: 'abc' }))).toBe(true);
    const login = call('/admin/login/', { cookie: 'abc' });
    expect(login.status).toBe(307);
    expect(location(login)).toBe('/admin/');
    const expired = call('/admin/login/?expired=1', { cookie: 'abc' });
    expect(passes(expired)).toBe(true);
    const cleared = expired.headers.get('set-cookie') ?? '';
    expect(cleared).toContain(`${COOKIE}=;`);
    expect(cleared).toMatch(/Path=\/admin/);
    expect(cleared).toMatch(/Max-Age=0/);
  });

  it('T247: a garbage cookie counts as present (the API decides) and an empty one as absent; the token is never decoded', () => {
    expect(passes(call('/admin/', { cookie: 'not.a.jwt!!' }))).toBe(true);
    expect(call('/admin/', { cookie: '' }).status).toBe(307);
  });

  it('regresion extra: a page let through tells the layout its path and query (without _rsc), overwriting any value the browser sent', () => {
    const response = call('/admin/messages/?before=2&_rsc=abc', { cookie: 'abc', headers: { 'x-admin-path': 'https://evil.example/' } });
    expect(passes(response)).toBe(true);
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-admin-path');
    expect(response.headers.get('x-middleware-request-x-admin-path')).toBe('/admin/messages/?before=2');
    // Handlers and the login get no such header.
    expect(call('/admin/api/content/services/', { cookie: 'abc' }).headers.get('x-middleware-request-x-admin-path')).toBeNull();
    expect(call('/admin/login/?expired=1', { cookie: 'abc' }).headers.get('x-middleware-request-x-admin-path')).toBeNull();
  });

  it('regresion extra: a page answers 405 (Allow: GET, HEAD, no-store) to any other method, with or without a cookie; handlers are left to themselves', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      for (const cookie of [undefined, 'abc']) {
        const response = call('/admin/messages/', { method, ...(cookie === undefined ? {} : { cookie }) });
        expect(response.status, `${method} ${cookie}`).toBe(405);
        expect(response.headers.get('allow')).toBe('GET, HEAD');
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
    }
    expect(call('/admin/login/', { method: 'POST' }).status).toBe(405);
    expect(passes(call('/admin/', { method: 'HEAD', cookie: 'abc' }))).toBe(true);
    expect(passes(call('/admin/api/content/services/', { method: 'PUT', cookie: 'abc' }))).toBe(true);
    expect(passes(call('/admin/api/login/', { method: 'POST' }))).toBe(true);
  });
});
