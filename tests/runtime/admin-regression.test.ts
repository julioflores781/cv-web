// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { bootAdmin, loginToken, registerCleanups, send } from '@/tests/helpers/admin-runtime';
import { PAGES } from '@/tests/helpers/runtime-pages';

registerCleanups();
const root = path.resolve(__dirname, '..', '..');
const standards = readFileSync(path.join(root, 'docs', 'web-standards.md'), 'utf8');

/** What only the panel has: its routes, the cookie, its handlers and texts that exist nowhere in the public site. */
const PANEL_MARKERS = ['/admin', 'cv_admin_token', 'admin/api', 'Cerrar sesión', 'Crear gemelo', 'ADMIN_UNAUTHORIZED'];

const scripts = (html: string): string[] => [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1] as string);

describe('panel regression (standalone + fake admin API)', () => {
  it('T421: the readiness probe of phase 3 is gone (the real proxy and panel replaced it) and the standards say why', () => {
    expect(existsSync(path.join(root, 'tests', 'runtime', 'proxy-ready.test.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'proxy.ts'))).toBe(true);
    expect(standards).toMatch(/proxy-ready/);
    expect(standards).toMatch(/T104/);
  });

  it('T423: no script of a public page is a panel chunk, and neither the public HTML nor its scripts mention the panel', async () => {
    const runtime = await bootAdmin();
    const panelScripts = new Set(scripts((await send(runtime, '/admin/login/')).text));
    const publicScripts = new Set<string>();
    for (const page of PAGES) {
      const reply = await send(runtime, page.path);
      expect(reply.status, page.path).toBe(200);
      for (const marker of PANEL_MARKERS) expect(reply.text, `${page.path} ${marker}`).not.toContain(marker);
      for (const src of scripts(reply.text)) publicScripts.add(src);
    }
    expect(publicScripts.size).toBeGreaterThan(0);
    // The panel has chunks of its own that no public page loads.
    expect([...panelScripts].filter((src) => !publicScripts.has(src)).length).toBeGreaterThan(0);
    for (const src of publicScripts) {
      const reply = await send(runtime, src);
      expect(reply.status, src).toBe(200);
      for (const marker of PANEL_MARKERS) expect(reply.text, `${src} ${marker}`).not.toContain(marker);
    }
  }, 120_000);

  it('regresion extra: a POST or DELETE to a panel page is a 405 (Allow: GET, HEAD, panel headers) that renders nothing and reads nothing from the API', async () => {
    const runtime = await bootAdmin();
    const token = await loginToken(runtime);
    const before = runtime.api.requests.length;
    for (const method of ['POST', 'DELETE']) {
      const reply = await send(runtime, '/admin/messages/', { method, cookie: token, body: {} });
      expect(reply.status, method).toBe(405);
      expect(reply.headers.get('allow')).toBe('GET, HEAD');
      expect(reply.headers.get('cache-control')).toBe('no-store');
      expect(reply.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(reply.text).toBe('');
    }
    expect(runtime.api.requests.slice(before)).toEqual([]);
    expect((await send(runtime, '/admin/messages/', { cookie: token })).status).toBe(200);
  }, 120_000);

  it('T427: the build passes with the proxy and the panel, and every route of the panel is dynamic (ƒ) next to the public ones', () => {
    const { code, output } = inject('build');
    expect(code, output).toBe(0);
    expect(output).toMatch(/ƒ Proxy/);
    const routes = output.split('\n').filter((line) => /^[├└┌│ ]*[ƒ○●◐] \//.test(line));
    const admin = routes.filter((line) => / \/admin/.test(line));
    for (const route of ['/admin', '/admin/login', '/admin/services', '/admin/projects', '/admin/architecture', '/admin/images', '/admin/messages', '/admin/settings', '/admin/api/login', '/admin/api/images']) {
      expect(admin.some((line) => line.trimEnd().endsWith(` ${route}`)), route).toBe(true);
    }
    expect(admin.filter((line) => !/ƒ \//.test(line))).toEqual([]);
    for (const route of ['/[[...slug]]', '/robots.txt', '/sitemap.xml']) expect(routes.some((line) => line.includes(`ƒ ${route}`)), route).toBe(true);
  });
});
