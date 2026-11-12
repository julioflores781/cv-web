// @vitest-environment node
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { SENTINELS, dirtyResume, startFakeApi } from '@/tests/helpers/fake-api';
import { type TestServer } from '@/tests/helpers/http-server';
import { readPdf } from '@/tests/helpers/pdf';
import { PAGES, get, render } from '@/tests/helpers/runtime-pages';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';
import type { Lang } from '@/lib/i18n/config';

const FILES: Record<Lang, string> = { es: '/cv-julio-flores-es.pdf', en: '/cv-julio-flores-en.pdf' };

let api: TestServer;
let server: StandaloneServer;
let summary = 'Resumen original';
let apiDown = false;

function listWoff(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listWoff(full);
    return entry.name.endsWith('.woff') ? [entry.name] : [];
  });
}

const pdf = async (lang: Lang, init: RequestInit = {}) => fetch(`${server.url}${FILES[lang]}`, { redirect: 'manual', ...init });

beforeAll(async () => {
  api = await startFakeApi({
    resume: (lang) => {
      const base = dirtyResume(lang) as { profile: Record<string, unknown> };
      return { ...base, profile: { ...base.profile, summary } };
    },
    respond: (resource) => (apiDown && resource === 'resume' ? { status: 503, body: { title: 'down', status: 503, code: 'DOWN' } } : undefined),
  });
  server = await startStandalone({ apiUrl: api.url });
}, 120_000);

afterAll(async () => {
  await server?.stop();
  await api?.close();
});

describe('runtime CV PDF', () => {
  it('T57: both PDFs are served as application/pdf in their language, under 1 MiB, and the fonts ship in the standalone', async () => {
    for (const lang of ['es', 'en'] as const) {
      const response = await pdf(lang);
      expect(response.status, lang).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      const buffer = Buffer.from(await response.arrayBuffer());
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.length).toBeLessThan(1024 * 1024);
      const { text } = await readPdf(buffer);
      expect(text.toUpperCase()).toContain('ADA EJEMPLO');
      const own = lang === 'es' ? resumeEs : resumeEn;
      const other = lang === 'es' ? resumeEn : resumeEs;
      expect(text).toContain(own.profile.label);
      expect(text).not.toContain(other.profile.label);
    }
    const woff = listWoff(path.join(inject('build').standaloneDir, 'node_modules', '@fontsource'));
    expect(woff.length).toBeGreaterThanOrEqual(3);
  }, 60_000);

  it('T58: the API sentinels are in no PDF text, metadata nor raw bytes', async () => {
    for (const lang of ['es', 'en'] as const) {
      const buffer = Buffer.from(await (await pdf(lang)).arrayBuffer());
      const info = await readPdf(buffer);
      const haystack = [info.text, info.title, info.author, info.creator, buffer.toString('latin1')].join('\n');
      for (const value of Object.values(SENTINELS)) expect(haystack, lang).not.toContain(value);
    }
  });

  it('T59: only the profile links the PDF of its language, and neither sitemap.xml nor robots.txt lists a PDF', async () => {
    for (const spec of PAGES) {
      const { doc } = await render(server, spec);
      const hrefs = [...doc.querySelectorAll('a[href$=".pdf"]')].map((a) => a.getAttribute('href'));
      expect(hrefs, spec.path).toEqual(spec.mode === 'profile' ? [FILES[spec.lang]] : []);
    }
    for (const file of ['/sitemap.xml', '/robots.txt']) expect((await get(server, file)).text, file).not.toMatch(/\.pdf/);
  });

  it('T62: when the resume changes between requests the next PDF has the new text and another ETag, and If-None-Match gives 304 until then', async () => {
    summary = 'Primer texto del currículum';
    const first = await pdf('es');
    const etag = first.headers.get('etag') as string;
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    expect((await readPdf(Buffer.from(await first.arrayBuffer()))).text).toContain(summary);
    const again = await pdf('es', { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    await again.arrayBuffer();

    summary = 'Segundo texto del currículum';
    const second = await pdf('es', { headers: { 'If-None-Match': etag } });
    expect(second.status).toBe(200);
    expect(second.headers.get('etag')).not.toBe(etag);
    expect((await readPdf(Buffer.from(await second.arrayBuffer()))).text).toContain(summary);
  }, 60_000);

  it('T66: with a PDF already in memory, an API that goes down makes the route answer 5xx', async () => {
    expect((await pdf('en')).status).toBe(200);
    apiDown = true;
    try {
      const response = await pdf('en');
      expect(response.status).toBeGreaterThanOrEqual(500);
      expect(await response.text()).not.toContain(api.url);
    } finally {
      apiDown = false;
    }
  }, 60_000);
});
