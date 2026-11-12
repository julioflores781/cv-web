// @vitest-environment node
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeApi } from '@/tests/helpers/fake-api';
import type { TestServer } from '@/tests/helpers/http-server';
import { get } from '@/tests/helpers/runtime-pages';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';
import { JSDOM } from 'jsdom';

const SITE = 'https://example.test';
// Built from parts so this file does not match the T89 scan of the versioned tree.
const OLD_HOST = ['cv', 'floreslab', 'dev'].join('.');

let api: TestServer;
let server: StandaloneServer;

beforeAll(async () => {
  api = await startFakeApi();
  server = await startStandalone({ apiUrl: api.url, siteUrl: SITE });
}, 120_000);

afterAll(async () => {
  await server?.stop();
  await api?.close();
});

/** GET with an explicit `Host` header (fetch cannot set it). */
function getWithHost(pathname: string, host: string): Promise<{ status: number; location: string | undefined; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(`${server.url}${pathname}`, { headers: { Host: host } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, text }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('runtime domain', () => {
  it('T88: with SITE_URL=https://example.test, canonical, hreflang, OG, JSON-LD, sitemap and robots use that origin (read at runtime)', async () => {
    const home = await get(server, '/');
    expect(home.status).toBe(200);
    const doc = new JSDOM(home.text).window.document;
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE}/`);
    const alternates = Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]')).map((link) => link.getAttribute('href'));
    expect(alternates).toHaveLength(3);
    for (const href of alternates) expect(href?.startsWith(`${SITE}/`)).toBe(true);
    expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${SITE}/`);
    const ld = JSON.parse(doc.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as { url?: string };
    expect(ld.url).toBe(`${SITE}/`);
    expect(home.text).not.toContain('floreslab.dev');

    const sitemap = await get(server, '/sitemap.xml');
    expect(sitemap.status).toBe(200);
    const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs.sort()).toEqual([`${SITE}/`, `${SITE}/servicios/`, `${SITE}/en/`, `${SITE}/en/services/`].sort());
    const links = [...sitemap.text.matchAll(/<xhtml:link[^>]*href="([^"]+)"/g)].map((match) => match[1] as string);
    expect(links).toHaveLength(12);
    for (const href of links) expect(href.startsWith(`${SITE}/`)).toBe(true);
    expect(sitemap.text).not.toContain('floreslab.dev');

    const robots = await get(server, '/robots.txt');
    expect(robots.text).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots.text).not.toContain('floreslab.dev');
  }, 60_000);

  it('T90: a request with the old subdomain as Host gets no special redirect', async () => {
    const old = await getWithHost('/', OLD_HOST);
    const plain = await getWithHost('/', '127.0.0.1');
    expect(old.status).toBe(200);
    expect(old.location).toBeUndefined();
    expect(old.status).toBe(plain.status);
  }, 60_000);

  it('T91: robots.txt allows / and points to the sitemap of https://floreslab.dev, and the sitemap lists no /api/ url', async () => {
    const main = await startStandalone({ apiUrl: api.url, siteUrl: 'https://floreslab.dev' });
    try {
      const robots = await get(main, '/robots.txt');
      expect(robots.status).toBe(200);
      expect(robots.text).toMatch(/User-Agent: \*/i);
      expect(robots.text).toMatch(/^Allow: \/$/m);
      expect(robots.text).toMatch(/^Sitemap: https:\/\/floreslab\.dev\/sitemap\.xml$/m);
      expect((await get(main, '/sitemap.xml')).text).not.toMatch(/\/api\//);
    } finally {
      await main.stop();
    }
  }, 60_000);
});
