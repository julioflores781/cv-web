// @vitest-environment node
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEAKED_CLIENT, architectureFor, projectsFor, servicesFor, withLeakedClient } from '@/tests/fixtures/content';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { SENTINELS, startFakeApi } from '@/tests/helpers/fake-api';
import { readPdf } from '@/tests/helpers/pdf';
import { CV_PDF_FILES, cvPdfHref } from '@/lib/pdf/files';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';

// These tests run the real `next build` (static export) against a local fake API that serves the
// fictitious "Ada Ejemplo" fixtures. The real API is never contacted.

const root = path.resolve(__dirname, '..', '..');
const OUT = path.join(root, 'out');
const SITE = 'https://cv.example.test';

interface PageSpec {
  file: string;
  lang: 'es' | 'en';
  mode: 'profile' | 'services';
  canonical: string;
}

const PAGES: PageSpec[] = [
  { file: 'index.html', lang: 'es', mode: 'profile', canonical: `${SITE}/` },
  { file: 'servicios/index.html', lang: 'es', mode: 'services', canonical: `${SITE}/servicios/` },
  { file: 'en/index.html', lang: 'en', mode: 'profile', canonical: `${SITE}/en/` },
  { file: 'en/services/index.html', lang: 'en', mode: 'services', canonical: `${SITE}/en/services/` },
];
const resumeOf = (lang: 'es' | 'en') => (lang === 'es' ? resumeEs : resumeEn);
const BUILD_TIMEOUT = 240_000;

interface BuildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runBuild(env: { apiUrl: string; cacheDir: string }): Promise<BuildResult> {
  // vitest sets NODE_ENV=test; `next build` must run in production mode, so it is overridden below.
  const inherited = Object.entries(process.env).filter(([key]) => key !== 'NODE_ENV');
  const childEnv: NodeJS.ProcessEnv = {
    ...Object.fromEntries(inherited),
    NODE_ENV: 'production',
    CV_API_URL: env.apiUrl,
    CV_CACHE_DIR: env.cacheDir,
    SITE_URL: SITE,
    NEXT_TELEMETRY_DISABLED: '1',
  };
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
      cwd: root,
      env: childEnv,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

const readOut = (file: string) => readFileSync(path.join(OUT, file), 'utf8');
const dom = (file: string) => new JSDOM(readOut(file)).window.document;

/** Visible page text without scripts, so two builds can be compared regardless of chunk hashes. */
function visibleText(file: string): string {
  const doc = dom(file);
  doc.querySelectorAll('script, style').forEach((node) => node.remove());
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

let cacheDir: string;
let healthy: TestServer | undefined;
let firstBuild: BuildResult;
let firstText: Record<string, string>;

beforeAll(async () => {
  cacheDir = await mkdtemp(path.join(os.tmpdir(), 'cv-web-build-cache-'));
  healthy = await startFakeApi();
}, BUILD_TIMEOUT);

afterAll(async () => {
  await healthy?.close();
  await rm(cacheDir, { recursive: true, force: true });
});

describe('build with a healthy API', () => {
  beforeAll(async () => {
    await rm(OUT, { recursive: true, force: true });
    firstBuild = await runBuild({ apiUrl: (healthy as TestServer).url, cacheDir });
    firstText = Object.fromEntries(
      PAGES.map((page) => [page.file, existsSync(path.join(OUT, page.file)) ? visibleText(page.file) : '']),
    );
  }, BUILD_TIMEOUT);

  it('builds successfully', () => {
    expect(firstBuild.stderr + firstBuild.stdout).toContain('Generating static pages');
    expect(firstBuild.code).toBe(0);
  });

  it('BA-T44: out/ has the 4 pages, sitemap.xml, robots.txt and 404.html, and no fr/, services/ nor en/servicios/', () => {
    for (const file of [...PAGES.map((page) => page.file), 'sitemap.xml', 'robots.txt', '404.html']) {
      expect(existsSync(path.join(OUT, file)), file).toBe(true);
    }
    for (const absent of ['fr', 'services', 'en/servicios']) expect(existsSync(path.join(OUT, absent)), absent).toBe(false);
  });

  it('BA-T45: each page has the right lang and data-mode, one h1 and the landmarks, and the profile h1 differs from the services h1', () => {
    const h1 = new Map<string, string>();
    for (const page of PAGES) {
      const doc = dom(page.file);
      expect(doc.documentElement.getAttribute('lang'), page.file).toBe(page.lang);
      expect(doc.body.getAttribute('data-mode'), page.file).toBe(page.mode);
      expect(doc.querySelectorAll('h1'), page.file).toHaveLength(1);
      expect(doc.querySelectorAll('header'), page.file).toHaveLength(1);
      expect(doc.querySelector('nav[aria-label]'), page.file).not.toBeNull();
      expect(doc.querySelectorAll('main'), page.file).toHaveLength(1);
      expect(doc.querySelector('footer'), page.file).not.toBeNull();
      h1.set(page.file, doc.querySelector('h1')?.textContent ?? '');
    }
    expect(h1.get('index.html')).not.toBe(h1.get('servicios/index.html'));
    expect(h1.get('en/index.html')).not.toBe(h1.get('en/services/index.html'));
    expect(h1.get('index.html')).not.toBe(h1.get('en/index.html'));
  });

  it('BA-T46: each page has title, description, its own canonical, 3 reciprocal hreflang and og:* metas', () => {
    for (const page of PAGES) {
      const doc = dom(page.file);
      expect(doc.title, page.file).toContain('Ada Ejemplo');
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content'), page.file).toBeTruthy();
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), page.file).toBe(page.canonical);
      const homologue = PAGES.filter((candidate) => candidate.mode === page.mode);
      const es = homologue.find((candidate) => candidate.lang === 'es');
      const en = homologue.find((candidate) => candidate.lang === 'en');
      const alternates = Object.fromEntries(
        Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]')).map((link) => [
          link.getAttribute('hreflang'),
          link.getAttribute('href'),
        ]),
      );
      expect(alternates, page.file).toEqual({ es: es?.canonical, en: en?.canonical, 'x-default': es?.canonical });
      for (const property of ['og:title', 'og:description', 'og:url', 'og:locale', 'og:type']) {
        expect(doc.querySelector(`meta[property="${property}"]`), `${page.file} ${property}`).not.toBeNull();
      }
      expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content'), page.file).toBe(page.canonical);
    }
    const titles = PAGES.map((page) => dom(page.file).title);
    expect(new Set(titles).size).toBe(4);
  });

  it("BA-T47: Ada's data appears in each page's own language, never mixed", () => {
    for (const page of PAGES) {
      const text = firstText[page.file] as string;
      const resume = resumeOf(page.lang);
      const other = resumeOf(page.lang === 'es' ? 'en' : 'es');
      expect(text, page.file).toContain('Ada Ejemplo');
      expect(text).toContain(resume.contact.email);
      expect(text).toContain(resume.profile.city as string);
      expect(text).not.toContain(other.profile.city as string);
      if (page.mode === 'profile') {
        expect(text).toContain(resume.profile.summary as string);
        expect(text).not.toContain(other.profile.summary as string);
        for (const job of resume.experience) expect(text).toContain(job.company);
        for (const item of resume.impact) expect(text).toContain(item.value);
        for (const group of resume.skills) for (const keyword of group.keywords) expect(text).toContain(keyword);
        expect(text).toContain(resume.education.education[0]?.institution as string);
      } else {
        expect(text).not.toContain(resume.profile.summary as string);
        for (const job of resume.experience) expect(text).not.toContain(job.company);
      }
    }
  });

  it('T60: each ld+json is valid JSON, a Person named Ada, with a coherent inLanguage', () => {
    for (const page of PAGES) {
      const scripts = dom(page.file).querySelectorAll('script[type="application/ld+json"]');
      expect(scripts, page.file).toHaveLength(1);
      const data = JSON.parse(scripts[0]?.textContent ?? '') as Record<string, unknown>;
      expect(data).toMatchObject({ '@type': 'Person', name: 'Ada Ejemplo', inLanguage: page.lang });
    }
  });

  it('T61: the sitemap lists the 4 pages with alternates, and robots allows everything and points to it', () => {
    const sitemap = readOut('sitemap.xml');
    for (const page of PAGES) expect(sitemap).toContain(`<loc>${page.canonical}</loc>`);
    expect(sitemap).toContain('hreflang="es"');
    expect(sitemap).toContain('hreflang="en"');
    const robots = readOut('robots.txt');
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('BA-T48: private values and labels sent by the API never appear in any generated file (HTML, RSC, JS)', () => {
    const files = listFiles(OUT).filter((file) => /\.(html|txt|js|json|xml|css|map|svg)$/.test(file));
    expect(files.length).toBeGreaterThan(5);
    const labels = /\b(phone|telephone|birthdate|dni)\b|tel[eé]fono|nacimiento|\bbirth\b/i;
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const hit = Object.values(SENTINELS).some((value) => text.includes(value)) || labels.test(text);
      if (hit) offenders.push(path.relative(OUT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('BA-T49: external links are noopener noreferrer, every #anchor has its id, fonts come from /_next/static/media, no Google Fonts and the favicon exists', () => {
    for (const page of PAGES) {
      const doc = dom(page.file);
      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const external = anchors.filter((a) => /^https?:/.test(a.getAttribute('href') ?? ''));
      for (const a of external) expect(a.getAttribute('rel'), `${page.file} ${a.getAttribute('href')}`).toBe('noopener noreferrer');
      if (page.mode === 'profile') expect(external.length).toBeGreaterThanOrEqual(2);
      for (const a of anchors.filter((candidate) => (candidate.getAttribute('href') ?? '').startsWith('#'))) {
        const id = (a.getAttribute('href') ?? '').slice(1);
        expect(doc.getElementById(id), `${page.file} #${id}`).not.toBeNull();
      }
      const href = doc.querySelector('link[rel="icon"]')?.getAttribute('href');
      expect(href, page.file).toBeTruthy();
      const pathname = new URL(href as string, 'https://cv.example.test/').pathname;
      expect(existsSync(path.join(OUT, pathname)), `${page.file} -> ${pathname}`).toBe(true);
    }
    const media = path.join(OUT, '_next', 'static', 'media');
    const fonts = readdirSync(media).filter((file) => file.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThanOrEqual(7);
    // The @font-face rules sit in /_next/static/chunks/*.css and point at ../media/*.woff2 (= /_next/static/media/).
    const css = listFiles(path.join(OUT, '_next', 'static')).filter((file) => file.endsWith('.css'));
    const faces = [...css.map((file) => readFileSync(file, 'utf8')).join('\n').matchAll(/url\(([^)]*\.woff2)\)/g)].map((match) => match[1]);
    expect(faces.length).toBeGreaterThanOrEqual(7);
    for (const face of faces) expect(face, 'font url').toMatch(/^(\.\.\/media\/|\/_next\/static\/media\/)/);
    const text = listFiles(OUT)
      .filter((file) => /\.(html|css|js)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(text).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
  });

  it('T64: a fallback copy per language is left in the cache directory, without private values', () => {
    expect(existsSync(path.join(cacheDir, 'resume-es.json'))).toBe(true);
    expect(existsSync(path.join(cacheDir, 'resume-en.json'))).toBe(true);
    const saved = readFileSync(path.join(cacheDir, 'resume-es.json'), 'utf8');
    expect(Object.values(SENTINELS).some((value) => saved.includes(value))).toBe(false);
  });

  it("HX-T41: the 4 pages carry the plane with Ada's ports and adapters in their own language, and a noscript per port", () => {
    for (const page of PAGES) {
      const html = readOut(page.file);
      const architecture = architectureFor(page.lang);
      const other = architectureFor(page.lang === 'es' ? 'en' : 'es');
      const doc = dom(page.file);
      expect(doc.querySelectorAll('[data-probe="node"]'), page.file).toHaveLength(architecture.ports.length);
      expect(doc.querySelector('[data-probe="core"]')?.textContent, page.file).toContain(architecture.core.name);
      expect(doc.querySelector('[data-probe="hero-inner"]')?.getAttribute('data-columns'), page.file).toBe('2');
      for (const port of architecture.ports) {
        expect(html, page.file).toContain(port.name);
        for (const adapter of port.adapters) expect(html, page.file).toContain(adapter.name);
      }
      expect(html).not.toContain(other.ports[0]?.name as string);
      // One noscript per port plus the contact form's own.
      expect(html.match(/<noscript>/g)?.length, page.file).toBe(architecture.ports.length + 1);
    }
    expect(existsSync(path.join(cacheDir, 'architecture-es.json'))).toBe(true);
    expect(existsSync(path.join(cacheDir, 'architecture-en.json'))).toBe(true);
  });

  it("CO-T74: each page shows Ada's services (services page) and projects in its own language, never mixed, and «a consultar» as such", () => {
    for (const page of PAGES) {
      const text = firstText[page.file] as string;
      const own = { services: servicesFor(page.lang), projects: projectsFor(page.lang) };
      const other = { services: servicesFor(page.lang === 'es' ? 'en' : 'es'), projects: projectsFor(page.lang === 'es' ? 'en' : 'es') };
      for (const project of own.projects) expect(text, `${page.file} ${project.title}`).toContain(project.title);
      for (const project of other.projects) expect(text, page.file).not.toContain(project.title);
      if (page.mode === 'services') {
        for (const service of own.services) expect(text, `${page.file} ${service.title}`).toContain(service.title);
        for (const service of other.services) expect(text, page.file).not.toContain(service.title);
        expect(text).toContain(page.lang === 'es' ? 'a consultar' : 'on request');
        expect(dom(page.file).querySelectorAll('[data-probe="service-card"]'), page.file).toHaveLength(own.services.length);
      } else {
        for (const service of own.services) expect(text, page.file).not.toContain(service.title);
        expect(dom(page.file).querySelector('aside'), page.file).toBeNull();
      }
    }
  });

  it('CO-T75: each page has the form, fieldset disabled, a noscript, the off-screen honeypot, and CV_API_URL only travels as the form destination (script payload)', () => {
    for (const page of PAGES) {
      const doc = dom(page.file);
      expect(doc.querySelectorAll('form'), page.file).toHaveLength(1);
      expect(doc.querySelector('form fieldset[disabled]'), page.file).not.toBeNull();
      expect(doc.querySelector('form noscript'), page.file).not.toBeNull();
      const trap = doc.querySelector('form [aria-hidden="true"] input#contact-extra');
      expect(trap?.getAttribute('tabindex'), page.file).toBe('-1');
      const html = readOut(page.file);
      doc.querySelectorAll('script').forEach((node) => node.remove());
      expect(doc.documentElement.outerHTML, `${page.file} visible markup`).not.toContain((healthy as TestServer).url);
      expect(html, `${page.file} form payload`).toContain((healthy as TestServer).url);
    }
  });

  it('CO-T77: the API request log has the expected GETs (4 resources x 2 languages, each at least once) and no other path', () => {
    const expected = ['resume', 'architecture', 'services', 'projects'].flatMap((resource) => ['es', 'en'].map((lang) => `/api/v1/${resource}?lang=${lang}`));
    const seen = new Set((healthy as TestServer).requests);
    for (const url of expected) expect(seen.has(url), url).toBe(true);
    expect([...seen].filter((url) => !expected.includes(url))).toEqual([]);
  });

  it('CO-T80: out/ has no placeholder markers, every <img src> exists and the private fields stay out', () => {
    for (const page of PAGES) {
      const text = firstText[page.file] as string;
      expect(text, page.file).not.toMatch(/\[[^\]]*\]/);
      expect(text, page.file).not.toMatch(/TU PRECIO|AÑOS|OTRO PROYECTO|Astro|CAPTURA/);
      for (const img of Array.from(dom(page.file).querySelectorAll('img[src]'))) {
        expect(existsSync(path.join(OUT, new URL(img.getAttribute('src') as string, SITE).pathname)), `${page.file} ${img.getAttribute('src')}`).toBe(true);
      }
    }
  });

  it('CO-T81: the pages number their sections «01 / servicios … 04 / contacto» (services) and «… 03 / proyectos, 04 / contacto» (profile)', () => {
    const eyebrows = (file: string) =>
      Array.from(dom(file).querySelectorAll('section h2'))
        .map((h2) => h2.closest('section')?.querySelector('p')?.textContent ?? '')
        .filter((text) => /^\d{2} \//.test(text));
    expect(eyebrows('servicios/index.html')).toEqual(['01 / servicios', '02 / proceso', '03 / proyectos', '04 / contacto']);
    expect(eyebrows('en/services/index.html')).toEqual(['01 / services', '02 / process', '03 / projects', '04 / contact']);
    expect(eyebrows('index.html')).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / proyectos', '04 / contacto']);
    expect(eyebrows('en/index.html')).toEqual(['01 / career', '02 / architecture', '03 / projects', '04 / contact']);
  });

  it('extra: services and projects fallback copies are saved per language', () => {
    for (const name of ['services-es.json', 'services-en.json', 'projects-es.json', 'projects-en.json']) {
      expect(existsSync(path.join(cacheDir, name)), name).toBe(true);
    }
  });

  it('PD-T22: out/ has both CV PDFs: %PDF- header, under 1 MiB, extractable «Ada Ejemplo» text in ES and EN', async () => {
    for (const lang of ['es', 'en'] as const) {
      const file = path.join(OUT, CV_PDF_FILES[lang]);
      expect(existsSync(file), file).toBe(true);
      const bytes = readFileSync(file);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.length).toBeLessThan(1024 * 1024);
      const info = await readPdf(bytes);
      expect(info.text).toContain('ADA EJEMPLO');
      expect(info.text).toContain(resumeOf(lang).profile.summary as string);
      expect(info.language).toBe(lang);
    }
  });

  it('PD-T23: the profile pages link the PDF in their language; the services pages do not', () => {
    for (const page of PAGES) {
      const links = Array.from(dom(page.file).querySelectorAll('a[download]')).map((a) => a.getAttribute('href'));
      expect(links, page.file).toEqual(page.mode === 'profile' ? [cvPdfHref(page.lang)] : []);
    }
  });

  it('PD-T24: the private sentinels are in neither the PDFs (text, metadata, raw bytes) nor the HTML', async () => {
    for (const lang of ['es', 'en'] as const) {
      const bytes = readFileSync(path.join(OUT, CV_PDF_FILES[lang]));
      const info = await readPdf(bytes);
      const haystack = [info.text, info.title, info.author, info.creator, bytes.toString('latin1')].join('\n');
      for (const value of Object.values(SENTINELS)) expect(haystack).not.toContain(value);
    }
    for (const page of PAGES) for (const value of Object.values(SENTINELS)) expect(readOut(page.file)).not.toContain(value);
  });

  it('PD-T26: sitemap.xml and robots.txt do not list the PDFs', () => {
    for (const name of Object.values(CV_PDF_FILES)) {
      expect(readOut('sitemap.xml')).not.toContain(name);
      expect(readOut('robots.txt')).not.toContain(name);
    }
  });

  it('PD-T27: @react-pdf/renderer is pinned to 4.9.0 and the @fontsource fonts to 5.3.0, all in dependencies', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@react-pdf/renderer']).toBe('4.9.0');
    for (const name of ['barlow-condensed', 'ibm-plex-sans', 'ibm-plex-mono']) expect(pkg.dependencies[`@fontsource/${name}`]).toBe('5.3.0');
  });

  it('BA-T51: out/ contains hex-grid-plano.svg and hex-grid-obra.svg', () => {
    for (const file of ['hex-grid-plano.svg', 'hex-grid-obra.svg']) expect(existsSync(path.join(OUT, file)), file).toBe(true);
  });
});

describe('build with the API down', () => {
  it(
    'BA-T50: with the fallback from T64 the 4 pages are built from it, with a warning',
    async () => {
      const result = await runBuild({ apiUrl: await closedPortUrl(), cacheDir });
      expect(result.code).toBe(0);
      expect(result.stdout + result.stderr).toMatch(/API unavailable for "es"/);
      for (const page of PAGES) expect(visibleText(page.file), page.file).toBe(firstText[page.file]);
      // HX-T43: the diagram also comes from its own fallback copy.
      expect(result.stdout + result.stderr).toMatch(/Architecture \(es\)/);
      for (const page of PAGES) expect(dom(page.file).querySelectorAll('[data-probe="node"]'), page.file).toHaveLength(3);
      // CO-T79: services and projects also come from their saved copies (the visible text is identical to the healthy build).
      expect(visibleText('servicios/index.html')).toContain(servicesFor('es')[0]?.title);
      expect(visibleText('index.html')).toContain(projectsFor('es')[0]?.title);
      // PD-T25: the PDFs also come out of the saved copy.
      for (const lang of ['es', 'en'] as const) {
        expect((await readPdf(readFileSync(path.join(OUT, CV_PDF_FILES[lang])))).text, lang).toContain('ADA EJEMPLO');
      }
    },
    BUILD_TIMEOUT,
  );

  it(
    'CO-T79: without the saved copy of one resource (projects) the build fails naming it',
    async () => {
      const partial = await mkdtemp(path.join(os.tmpdir(), 'cv-web-partial-'));
      try {
        await cp(cacheDir, partial, { recursive: true });
        await rm(path.join(partial, 'projects-es.json'));
        await rm(OUT, { recursive: true, force: true });
        const result = await runBuild({ apiUrl: await closedPortUrl(), cacheDir: partial });
        expect(result.code).not.toBe(0);
        expect(existsSync(path.join(OUT, 'index.html'))).toBe(false);
        expect(result.stderr).toMatch(/Projects \(es\) unavailable/);
        expect(result.stderr).toMatch(/Refusing to publish a site without data/);
      } finally {
        await rm(partial, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );

  it(
    'BA-T50: without a fallback copy the build fails, writes no index.html and says it refuses to publish without data',
    async () => {
      const emptyCache = await mkdtemp(path.join(os.tmpdir(), 'cv-web-empty-'));
      try {
        await rm(OUT, { recursive: true, force: true });
        const result = await runBuild({ apiUrl: await closedPortUrl(), cacheDir: emptyCache });
        expect(result.code).not.toBe(0);
        expect(existsSync(path.join(OUT, 'index.html'))).toBe(false);
        expect(result.stderr).toMatch(/Resume \((es|en)\) unavailable/);
        expect(result.stderr).toMatch(/request failed/);
        expect(result.stderr).toMatch(/Refusing to publish a site without data/);
      } finally {
        await rm(emptyCache, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );

  it(
    'T67: a 200 with invalid JSON and an empty cache fails the build',
    async () => {
      const emptyCache = await mkdtemp(path.join(os.tmpdir(), 'cv-web-empty-'));
      const broken = await startServer((_req, res) => json(res, 200, '{ this is not json', 'application/json'));
      try {
        await rm(OUT, { recursive: true, force: true });
        const result = await runBuild({ apiUrl: broken.url, cacheDir: emptyCache });
        expect(result.code).not.toBe(0);
        expect(existsSync(path.join(OUT, 'index.html'))).toBe(false);
        expect(result.stderr).toMatch(/not valid JSON/);
        expect(existsSync(path.join(emptyCache, 'resume-es.json'))).toBe(false);
      } finally {
        await broken.close();
        await rm(emptyCache, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );
});

describe('build with the architecture endpoint', () => {
  it(
    'HX-T42 + CO-T78: ports, services and projects all [] build; no page keeps the plane, services, projects or their links, and the sections renumber',
    async () => {
      const emptyCache = await mkdtemp(path.join(os.tmpdir(), 'cv-web-empty-diagram-'));
      const api = await startFakeApi({
        architecture: () => ({ core: { name: '', description: null }, ports: [] }),
        services: () => [],
        projects: () => [],
      });
      try {
        await rm(OUT, { recursive: true, force: true });
        const result = await runBuild({ apiUrl: api.url, cacheDir: emptyCache });
        expect(result.code, result.stderr).toBe(0);
        expect(result.stdout + result.stderr).toMatch(/section omitted/);
        for (const page of PAGES) {
          const html = readOut(page.file);
          const doc = dom(page.file);
          expect(doc.querySelector('[data-probe="hero-inner"]')?.getAttribute('data-columns'), page.file).toBe('1');
          for (const probe of ['plane', 'panel', 'legend', 'core']) expect(doc.querySelector(`[data-probe="${probe}"]`), `${page.file} ${probe}`).toBeNull();
          expect(html).not.toMatch(/core\/|tap a node|toca un nodo/);
          for (const absent of ['#services', '#projects', 'aside']) expect(doc.querySelector(absent), `${page.file} ${absent}`).toBeNull();
          expect(doc.querySelector('a[href="#projects"]'), page.file).toBeNull();
        }
        const eyebrows = (file: string) =>
          Array.from(dom(file).querySelectorAll('section h2'))
            .map((h2) => h2.closest('section')?.querySelector('p')?.textContent ?? '')
            .filter((text) => /^\d{2} \//.test(text));
        expect(eyebrows('servicios/index.html')).toEqual(['01 / proceso', '02 / contacto']);
        expect(eyebrows('index.html')).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / contacto']);
        expect(result.stdout + result.stderr).toMatch(/Services \(es\).*section omitted/);
        expect(result.stdout + result.stderr).toMatch(/Projects \(es\).*section omitted/);
      } finally {
        await api.close();
        await rm(emptyCache, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );

  it(
    'HX-T43: with a healthy resume but no architecture answer and no saved copy, the build fails naming the resource',
    async () => {
      const emptyCache = await mkdtemp(path.join(os.tmpdir(), 'cv-web-no-diagram-'));
      const api = await startServer((req, res) => {
        const lang = new URL(req.url ?? '', 'http://x').searchParams.get('lang') === 'en' ? 'en' : 'es';
        // Only the architecture endpoint is missing. Services and projects answer, so the architecture is the single
        // failing resource: the page loads all four in parallel and the build reports whichever rejects first, which
        // made this test race when several endpoints returned 404.
        if (req.url?.startsWith('/api/v1/resume')) json(res, 200, lang === 'es' ? resumeEs : resumeEn);
        else if (req.url?.startsWith('/api/v1/services')) json(res, 200, servicesFor(lang));
        else if (req.url?.startsWith('/api/v1/projects')) json(res, 200, projectsFor(lang));
        else json(res, 404,{ title: 'Not found', detail: 'x', status: 404, code: 'NOT_FOUND' }, 'application/problem+json');
      });
      try {
        await rm(OUT, { recursive: true, force: true });
        const result = await runBuild({ apiUrl: api.url, cacheDir: emptyCache });
        expect(result.code).not.toBe(0);
        expect(existsSync(path.join(OUT, 'index.html'))).toBe(false);
        expect(result.stderr).toMatch(/Architecture \((es|en)\) unavailable/);
        expect(result.stderr).toMatch(/Refusing to publish a site without data/);
      } finally {
        await api.close();
        await rm(emptyCache, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );
});

describe('build with a hostile projects API', () => {
  it(
    'CO-T76: the real client of an anonymous project sent by the API is in neither out/ nor the fallback directory',
    async () => {
      const emptyCache = await mkdtemp(path.join(os.tmpdir(), 'cv-web-leak-'));
      const api = await startFakeApi({ projects: (lang) => withLeakedClient(projectsFor(lang)) });
      try {
        await rm(OUT, { recursive: true, force: true });
        const result = await runBuild({ apiUrl: api.url, cacheDir: emptyCache });
        expect(result.code, result.stderr).toBe(0);
        const files = [...listFiles(OUT), ...listFiles(emptyCache)];
        expect(files.some((file) => file.startsWith(emptyCache))).toBe(true);
        const offenders = files.filter((file) => readFileSync(file).includes(LEAKED_CLIENT)).map((file) => path.relative(root, file));
        expect(offenders).toEqual([]);
        expect(visibleText('index.html')).toContain(projectsFor('es')[2]?.clientLabel as string);
      } finally {
        await api.close();
        await rm(emptyCache, { recursive: true, force: true });
      }
    },
    BUILD_TIMEOUT,
  );
});
