// @vitest-environment node
import { inject } from 'vitest';
import { describe, expect, it } from 'vitest';
import { bootAdmin, COOKIE, registerCleanups, send } from '@/tests/helpers/admin-runtime';
import { PAGES as PAGE_SPECS } from '@/tests/helpers/runtime-pages';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

registerCleanups();
const root = path.resolve(__dirname, '..', '..');
const PANEL_HEADERS = ['x-robots-tag', 'x-frame-options', 'content-security-policy', 'referrer-policy'];
const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? listFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

describe('admin gate (standalone + fake admin API)', () => {
  it('T280: the build lists the Proxy and every /admin route as dynamic; the public page stays dynamic and no prerendered html holds «Ada»', () => {
    const { output, code } = inject('build');
    expect(code).toBe(0);
    expect(output).toMatch(/ƒ Proxy/);
    expect(output).toMatch(/ƒ \/\[\[\.\.\.slug\]\]/);
    const adminRoutes = output.split('\n').filter((line) => /^[├└┌│ ]*[ƒ○●◐] \/admin/.test(line));
    expect(adminRoutes.length).toBeGreaterThanOrEqual(6);
    expect(adminRoutes.filter((line) => !/ƒ /.test(line))).toEqual([]);
    const html = listFiles(path.join(root, '.next', 'server', 'app')).filter((file) => file.endsWith('.html'));
    expect(html.filter((file) => readFileSync(file, 'utf8').includes('Ada'))).toEqual([]);
  });

  it('T281: public pages, health, contact and the PDFs answer as before: no set-cookie and none of the panel headers', async () => {
    const runtime = await bootAdmin();
    for (const page of PAGE_SPECS) {
      const reply = await send(runtime, page.path);
      expect(reply.status, page.path).toBe(200);
      expect(reply.headers.get('set-cookie'), page.path).toBeNull();
      for (const name of PANEL_HEADERS) expect(reply.headers.get(name), `${page.path} ${name}`).toBeNull();
      expect(reply.text).not.toContain(COOKIE);
    }
    for (const asset of ['/api/health/', '/cv-julio-flores-es.pdf', '/cv-julio-flores-en.pdf']) {
      const reply = await send(runtime, asset);
      expect(reply.status, asset).toBe(200);
      expect(reply.headers.get('set-cookie'), asset).toBeNull();
      expect(reply.headers.get('x-robots-tag'), asset).toBeNull();
    }
    const contact = await send(runtime, '/api/contact/', { method: 'POST', body: { name: '', email: '', message: '' } });
    expect(contact.status).toBe(400);
    expect(contact.headers.get('set-cookie')).toBeNull();
    expect(contact.headers.get('x-robots-tag')).toBeNull();
  }, 120_000);

  it('T282: /admin redirects 308 to /admin/ and that one, without a cookie, to the login with next', async () => {
    const runtime = await bootAdmin();
    const slashless = await send(runtime, '/admin');
    expect(slashless.status).toBe(308);
    expect(new URL(slashless.headers.get('location') ?? '', runtime.server.url).pathname).toBe('/admin/');
    const gate = await send(runtime, '/admin/');
    expect(gate.status).toBe(307);
    expect(new URL(gate.headers.get('location') ?? '', runtime.server.url).href).toBe(`${runtime.server.url}/admin/login/?next=%2Fadmin%2F`);
  }, 120_000);

  it('T283: the login page, a handler and a 404 carry the panel headers; the public home does not carry X-Robots-Tag', async () => {
    const runtime = await bootAdmin();
    const replies = [
      await send(runtime, '/admin/login/'),
      await send(runtime, '/admin/api/login/', { method: 'POST', body: {} }),
      await send(runtime, '/admin/zzz/', { cookie: 'garbage' }),
    ];
    expect(replies.map((reply) => reply.status)).toEqual([200, 400, 404]);
    for (const reply of replies) {
      expect(reply.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(reply.headers.get('cache-control')).toBe('no-store');
      expect(reply.headers.get('x-frame-options')).toBe('DENY');
      expect(reply.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
      expect(reply.headers.get('referrer-policy')).toBe('no-referrer');
      expect(reply.headers.get('x-content-type-options')).toBe('nosniff');
    }
    expect((await send(runtime, '/')).headers.get('x-robots-tag')).toBeNull();
  }, 120_000);

  it('T291: GET, PUT and OPTIONS on /admin/api/login/ are 405 with Allow: POST', async () => {
    const runtime = await bootAdmin();
    for (const method of ['GET', 'PUT', 'OPTIONS']) {
      const reply = await send(runtime, '/admin/api/login/', { method });
      expect(reply.status, method).toBe(405);
      expect(reply.headers.get('allow'), method).toBe('POST');
    }
  }, 120_000);

  it('T292: an unknown handler path and an unknown page, with a cookie, are 404 with the 404 of the panel and noindex', async () => {
    const runtime = await bootAdmin();
    for (const target of ['/admin/api/nope/', '/admin/nope/']) {
      const reply = await send(runtime, target, { cookie: 'garbage' });
      expect(reply.status, target).toBe(404);
      expect(reply.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      // Like the public 404, the HTML is Next's shell (the not-found tree of several root layouts renders on the client); the panel's 404 is in the payload.
      expect(reply.text).toContain('No encontrado');
      expect(reply.text).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    }
  }, 120_000);

  it('T293: the server reaches «Ready» with proxy and instrumentation without warnings, and a broken answer of the API in the panel logs one render_error without headers', async () => {
    const runtime = await bootAdmin();
    expect(runtime.server.log()).toMatch(/Ready in/);
    expect(runtime.server.log()).not.toMatch(/warn|deprecat|middleware/i);
    runtime.api.admin?.inject('session', { mode: 'invalid-json' });
    const reply = await send(runtime, '/admin/', { cookie: 'garbage' });
    expect(reply.status).toBe(500);
    expect(reply.text).not.toContain(runtime.api.url);
    const lines = runtime.server.log().split('\n').filter((line) => line.includes('"render_error"'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/cookie|authorization|garbage|set-cookie/i);
  }, 120_000);
});
