// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMPTY_ARCHITECTURE, MEDIA_ORIGIN, architectureFor, projectsFor, sampleImage, servicesFor } from '@/tests/fixtures/content';
import { fakeImage } from '@/tests/helpers/admin-images';
import { PASSPHRASE } from '@/tests/helpers/admin-runtime';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { SENTINELS, startFakeApi } from '@/tests/helpers/fake-api';
import { type TestServer } from '@/tests/helpers/http-server';
import { PAGES, assetUrls, eyebrows, get, getRsc, render, type Mode, type Rendered } from '@/tests/helpers/runtime-pages';
import { TEST_SITE, startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';

const resumeOf = (lang: 'es' | 'en') => (lang === 'es' ? resumeEs : resumeEn);
const otherOf = (lang: 'es' | 'en') => (lang === 'es' ? 'en' : 'es');

let api: TestServer;
let server: StandaloneServer;
const rendered = new Map<string, Rendered>();
const page = (path: string): Rendered => rendered.get(path) as Rendered;

beforeAll(async () => {
  api = await startFakeApi();
  server = await startStandalone({ apiUrl: api.url });
  for (const spec of PAGES) rendered.set(spec.path, await render(server, spec));
}, 120_000);

afterAll(async () => {
  await server?.stop();
  await api?.close();
});

describe('runtime pages', () => {
  it('T27: the 4 pages answer 200 text/html with the right lang and data-mode and a non-cacheable Cache-Control', () => {
    for (const spec of PAGES) {
      const result = page(spec.path);
      expect(result.status, spec.path).toBe(200);
      expect(result.headers.get('content-type'), spec.path).toMatch(/^text\/html/);
      expect(result.doc.documentElement.getAttribute('lang'), spec.path).toBe(spec.lang);
      expect(result.doc.body.getAttribute('data-mode'), spec.path).toBe(spec.mode);
      const cacheControl = result.headers.get('cache-control') ?? '';
      expect(cacheControl, spec.path).toMatch(/no-store|no-cache|private/);
      expect(cacheControl, spec.path).not.toMatch(/s-maxage|public/);
    }
  });

  it('T28: unknown languages and paths are 404 and a missing trailing slash is a 308; none of them calls the API', async () => {
    const before = api.requests.length;
    for (const path of ['/fr/', '/en/servicios/', '/zzz/']) expect((await get(server, path)).status, path).toBe(404);
    const redirect = await get(server, '/servicios');
    expect(redirect.status).toBe(308);
    expect(new URL(redirect.headers.get('location') as string, server.url).pathname).toBe('/servicios/');
    expect(api.requests.slice(before)).toEqual([]);
  });

  it('T29: one h1 and the landmarks, own title/description/canonical, 3 reciprocal hreflang, og:* and a Person JSON-LD in the page language', () => {
    const h1 = new Map<string, string>();
    for (const spec of PAGES) {
      const { doc } = page(spec.path);
      expect(doc.querySelectorAll('h1'), spec.path).toHaveLength(1);
      expect(doc.querySelectorAll('header'), spec.path).toHaveLength(1);
      expect(doc.querySelector('nav[aria-label]'), spec.path).not.toBeNull();
      expect(doc.querySelectorAll('main'), spec.path).toHaveLength(1);
      expect(doc.querySelector('footer'), spec.path).not.toBeNull();
      h1.set(spec.path, doc.querySelector('h1')?.textContent ?? '');

      expect(doc.title, spec.path).toContain('Ada Ejemplo');
      expect(doc.querySelector('meta[name="description"]')?.getAttribute('content'), spec.path).toBeTruthy();
      expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), spec.path).toBe(spec.canonical);
      const homologue = PAGES.filter((candidate) => candidate.mode === spec.mode);
      const es = homologue.find((candidate) => candidate.lang === 'es');
      const en = homologue.find((candidate) => candidate.lang === 'en');
      const alternates = Object.fromEntries(
        Array.from(doc.querySelectorAll('link[rel="alternate"][hreflang]')).map((link) => [link.getAttribute('hreflang'), link.getAttribute('href')]),
      );
      expect(alternates, spec.path).toEqual({ es: es?.canonical, en: en?.canonical, 'x-default': es?.canonical });
      for (const property of ['og:title', 'og:description', 'og:url', 'og:locale', 'og:type']) {
        expect(doc.querySelector(`meta[property="${property}"]`), `${spec.path} ${property}`).not.toBeNull();
      }
      expect(doc.querySelector('meta[property="og:url"]')?.getAttribute('content'), spec.path).toBe(spec.canonical);

      const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
      expect(scripts, spec.path).toHaveLength(1);
      const data = JSON.parse(scripts[0]?.textContent ?? '') as Record<string, unknown>;
      expect(data).toMatchObject({ '@type': 'Person', name: 'Ada Ejemplo', inLanguage: spec.lang });
    }
    expect(h1.get('/')).not.toBe(h1.get('/servicios/'));
    expect(h1.get('/')).not.toBe(h1.get('/en/'));
    expect(new Set(PAGES.map((spec) => page(spec.path).doc.title)).size).toBe(4);
  });

  it("T30: Ada's data appears in each page's own language, never mixed", () => {
    for (const spec of PAGES) {
      const { visible } = page(spec.path);
      const resume = resumeOf(spec.lang);
      const other = resumeOf(otherOf(spec.lang));
      expect(visible, spec.path).toContain('Ada Ejemplo');
      expect(visible).toContain(resume.contact.email);
      expect(visible).toContain(resume.profile.city as string);
      expect(visible).not.toContain(other.profile.city as string);
      if (spec.mode === 'profile') {
        expect(visible).toContain(resume.profile.summary as string);
        expect(visible).not.toContain(other.profile.summary as string);
        for (const job of resume.experience) expect(visible).toContain(job.company);
        for (const item of resume.impact) expect(visible).toContain(item.value);
        for (const group of resume.skills) for (const keyword of group.keywords) expect(visible).toContain(keyword);
        expect(visible).toContain(resume.education.education[0]?.institution as string);
      } else {
        expect(visible).not.toContain(resume.profile.summary as string);
        for (const job of resume.experience) expect(visible).not.toContain(job.company);
      }
    }
  });

  it('T31: the private sentinels and labels sent by the API are in no HTML, RSC payload or JS chunk', async () => {
    const labels = /\b(phone|telephone|birthdate|dni)\b|tel[eé]fono|nacimiento|\bbirth\b/i;
    const bodies: Array<[string, string]> = [];
    for (const spec of PAGES) {
      bodies.push([spec.path, page(spec.path).text]);
      const rsc = await getRsc(server, spec.path);
      // Positive control: the payload really carries the page data, so the absence checks below mean something.
      expect(rsc, `${spec.path} (RSC)`).toContain(resumeOf(spec.lang).profile.name);
      bodies.push([`${spec.path} (RSC)`, rsc]);
      for (const src of assetUrls(page(spec.path).doc, 'script[src]')) bodies.push([src, (await get(server, src)).text]);
    }
    expect(bodies.length).toBeGreaterThan(8);
    const offenders = bodies.filter(([, text]) => Object.values(SENTINELS).some((value) => text.includes(value)) || labels.test(text)).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it("TR-T26 (T32): the plane with Ada's ports and a noscript per port, the services and projects, and the section numbering by (mode, lang)", () => {
    for (const spec of PAGES) {
      const { text, doc, visible } = page(spec.path);
      const architecture = architectureFor(spec.lang);
      const otherArchitecture = architectureFor(otherOf(spec.lang));
      expect(doc.querySelectorAll('[data-probe="node"]'), spec.path).toHaveLength(architecture.ports.length);
      expect(doc.querySelector('[data-probe="core"]')?.textContent, spec.path).toContain(architecture.core.name);
      expect(doc.querySelector('[data-probe="hero-inner"]')?.getAttribute('data-columns'), spec.path).toBe('2');
      for (const port of architecture.ports) {
        expect(text, spec.path).toContain(port.name);
        for (const adapter of port.adapters) expect(text, spec.path).toContain(adapter.name);
      }
      expect(text).not.toContain(otherArchitecture.ports[0]?.name as string);
      // One noscript per port plus the contact form's own.
      expect(text.match(/<noscript>/g)?.length, spec.path).toBe(architecture.ports.length + 1);

      const own = { services: servicesFor(spec.lang), projects: projectsFor(spec.lang) };
      const other = { services: servicesFor(otherOf(spec.lang)), projects: projectsFor(otherOf(spec.lang)) };
      for (const project of own.projects) expect(visible, `${spec.path} ${project.title}`).toContain(project.title);
      for (const project of other.projects) expect(visible, spec.path).not.toContain(project.title);
      if (spec.mode === 'services') {
        for (const service of own.services) expect(visible, `${spec.path} ${service.title}`).toContain(service.title);
        for (const service of other.services) expect(visible, spec.path).not.toContain(service.title);
        expect(visible).toContain(spec.lang === 'es' ? 'a consultar' : 'on request');
        expect(doc.querySelectorAll('[data-probe="service-card"]'), spec.path).toHaveLength(own.services.length);
      } else {
        for (const service of own.services) expect(visible, spec.path).not.toContain(service.title);
        expect(doc.querySelector('aside'), spec.path).toBeNull();
      }
    }
    // Indexed by (mode, lang), never by path, so moving the routes does not touch this table.
    const expected: Record<`${Mode}|${'es' | 'en'}`, string[]> = {
      'profile|es': ['01 / trayectoria', '02 / formación', '03 / arquitectura', '04 / proyectos', '05 / contacto'],
      'profile|en': ['01 / career', '02 / education', '03 / architecture', '04 / projects', '05 / contact'],
      'services|es': ['01 / servicios', '02 / proceso', '03 / proyectos', '04 / contacto'],
      'services|en': ['01 / services', '02 / process', '03 / projects', '04 / contact'],
    };
    for (const spec of PAGES) expect(eyebrows(page(spec.path).doc), spec.path).toEqual(expected[`${spec.mode}|${spec.lang}`]);
  });

  it('T33: external links are noopener noreferrer, every #anchor has its id, fonts come from /_next/static/media, no Google Fonts, the favicon answers 200 and no placeholder is left', async () => {
    const fontCss: string[] = [];
    for (const spec of PAGES) {
      const { doc, visible, text } = page(spec.path);
      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const external = anchors.filter((a) => /^https?:/.test(a.getAttribute('href') ?? ''));
      for (const a of external) expect(a.getAttribute('rel'), `${spec.path} ${a.getAttribute('href')}`).toBe('noopener noreferrer');
      if (spec.mode === 'profile') expect(external.length).toBeGreaterThanOrEqual(2);
      for (const a of anchors.filter((candidate) => (candidate.getAttribute('href') ?? '').startsWith('#'))) {
        const id = (a.getAttribute('href') ?? '').slice(1);
        expect(doc.getElementById(id), `${spec.path} #${id}`).not.toBeNull();
      }
      const icon = doc.querySelector('link[rel="icon"]')?.getAttribute('href');
      expect(icon, spec.path).toBeTruthy();
      expect((await get(server, new URL(icon as string, server.url).pathname)).status, `${spec.path} favicon`).toBe(200);

      expect(text).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
      expect(visible, spec.path).not.toMatch(/\[[^\]]*\]/);
      expect(visible, spec.path).not.toMatch(/TU PRECIO|AÑOS|OTRO PROYECTO|Astro|CAPTURA/);
      for (const img of Array.from(doc.querySelectorAll('img[src]'))) {
        expect((await get(server, new URL(img.getAttribute('src') as string, server.url).pathname)).status, `${spec.path} ${img.getAttribute('src')}`).toBe(200);
      }
      for (const href of assetUrls(doc, 'link[rel="stylesheet"][href]')) fontCss.push((await get(server, href)).text);
    }
    const faces = [...fontCss.join('\n').matchAll(/url\(([^)]*\.woff2)\)/g)].map((match) => match[1] as string);
    expect(faces.length).toBeGreaterThanOrEqual(7);
    for (const face of new Set(faces)) {
      expect(face, 'font url').toMatch(/^(\.\.\/media\/|\/_next\/static\/media\/)/);
      expect((await get(server, `/_next/static/media/${face.split('/').pop()}`)).status, face).toBe(200);
    }
  });

  it('T34: one page makes exactly one API request per resource and language, although generateMetadata and Page both read', async () => {
    const reader = await startFakeApi();
    const isolated = await startStandalone({ apiUrl: reader.url });
    try {
      expect((await get(isolated, '/servicios/')).status).toBe(200);
      expect(reader.requests.slice().sort()).toEqual(
        ['architecture', 'projects', 'resume', 'services'].map((resource) => `/api/v1/${resource}?lang=es`).sort(),
      );
      const before = reader.requests.length;
      expect((await get(isolated, '/en/')).status).toBe(200);
      expect(reader.requests.slice(before).sort()).toEqual(
        ['architecture', 'projects', 'resume', 'services'].map((resource) => `/api/v1/${resource}?lang=en`).sort(),
      );
    } finally {
      await isolated.stop();
      await reader.close();
    }
  }, 60_000);

  it('extra (BA-T51): the two hexagon grid backgrounds are served', async () => {
    for (const file of ['hex-grid-plano.svg', 'hex-grid-obra.svg']) expect((await get(server, `/${file}`)).status, file).toBe(200);
  });

  it('T36: the API URL (CV_API_URL, cv-api) is in no HTML, RSC payload or JS chunk', async () => {
    const hosts = [api.url, new URL(api.url).host, 'cv-api'];
    const bodies: string[] = [];
    for (const spec of PAGES) {
      const rsc = await getRsc(server, spec.path);
      expect(rsc, `${spec.path} (RSC)`).toContain(resumeOf(spec.lang).profile.name);
      bodies.push(page(spec.path).text, rsc);
      for (const src of assetUrls(page(spec.path).doc, 'script[src]')) bodies.push((await get(server, src)).text);
    }
    for (const body of bodies) for (const host of hosts) expect(body).not.toContain(host);
  });
});

describe('project covers (images[] from the API)', () => {
  const R2_KEY = 'site/projects/SENTINEL-R2-KEY-0000.webp';
  const EMPLOYER_URL = `${MEDIA_ORIGIN}/site/projects/SENTINEL-EMPLOYER-IMAGE.webp`;
  const ANONYMOUS_URL = `${MEDIA_ORIGIN}/site/projects/SENTINEL-ANONYMOUS-IMAGE.webp`;
  /** A hostile API: the own project carries a cover plus its internal key; employer and anonymous ones carry images they must never show. */
  const hostile = (lang: 'es' | 'en') =>
    projectsFor(lang).map((project) => {
      if (project.relation === 'own') return { ...project, images: [{ ...sampleImage(1, lang), key: R2_KEY }, sampleImage(2, lang)] };
      const url = project.disclosure === 'anonymous' ? ANONYMOUS_URL : EMPLOYER_URL;
      return { ...project, images: [{ ...sampleImage(3, lang), url, key: R2_KEY }] };
    });

  it('T416 / T417: an own + public project shows its cover (public URL and alt per language); employer and anonymous ones leave no <img> nor URL; images:[] keeps the mesh; the internal key never reaches HTML nor RSC; an API down is still a 500', async () => {
    let down = false;
    const imageApi = await startFakeApi({ projects: hostile, respond: (resource) => (down && resource === 'projects' ? { status: 503, body: { status: 503 } } : undefined) });
    const withImages = await startStandalone({ apiUrl: imageApi.url });
    try {
      for (const spec of PAGES) {
        const result = await render(withImages, spec);
        expect(result.status, spec.path).toBe(200);
        const images = Array.from(result.doc.querySelectorAll('#projects img'));
        expect(images.map((img) => [img.getAttribute('src'), img.getAttribute('alt')]), spec.path).toEqual([[sampleImage(1, spec.lang).url, sampleImage(1, spec.lang).alt]]);
        const [cover] = images;
        expect(cover?.closest('[data-probe="featured"]'), spec.path).not.toBeNull();
        expect(cover?.getAttribute('width'), spec.path).toBe('1280');
        expect(cover?.getAttribute('height'), spec.path).toBe('720');
        expect(cover?.getAttribute('loading'), spec.path).toBe('lazy');
        expect(result.doc.querySelectorAll('[data-probe="card"] .gridbg'), spec.path).toHaveLength(2);
        const rsc = await getRsc(withImages, spec.path);
        // Positive control: the cover URL is in the payload, so the absences below are real.
        expect(rsc, `${spec.path} (RSC)`).toContain(sampleImage(1, spec.lang).url);
        for (const body of [result.text, rsc]) {
          for (const leak of [EMPLOYER_URL, ANONYMOUS_URL, 'SENTINEL-EMPLOYER-IMAGE', 'SENTINEL-ANONYMOUS-IMAGE', R2_KEY, 'SENTINEL-R2-KEY', sampleImage(2, spec.lang).url]) {
            expect(body, `${spec.path} ${leak}`).not.toContain(leak);
          }
          expect(body, spec.path).not.toMatch(/\\?"key\\?":/);
        }
      }
      for (const spec of PAGES) {
        expect(page(spec.path).doc.querySelector('#projects img'), spec.path).toBeNull();
        expect(page(spec.path).doc.querySelectorAll('[data-probe="card"] .gridbg'), spec.path).toHaveLength(2);
      }
      down = true;
      expect((await get(withImages, '/')).status).toBe(500);
    } finally {
      await withImages.stop();
      await imageApi.close();
    }
  }, 90_000);

  it('extra (T416 end to end, with web-admin-images): an image uploaded through the panel and set as cover shows on the public pages at once, in ES and EN', async () => {
    const adminApi = await startFakeApi({ admin: {} });
    const panel = await startStandalone({ apiUrl: adminApi.url, siteUrl: TEST_SITE });
    const origin = new URL(TEST_SITE).origin;
    try {
      const login = await fetch(`${panel.url}/admin/api/login/`, {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ [['pass', 'word'].join('')]: PASSPHRASE }),
      });
      const token = login.headers.getSetCookie().map((line) => /^cv_admin_token=([^;]*)/.exec(line)?.[1]).find((value) => value !== undefined);
      expect(login.status).toBe(200);
      const cookie = `cv_admin_token=${token ?? ''}`;
      const form = new FormData();
      form.append('file', new Blob([fakeImage('webp', 4096, 800, 600)], { type: 'image/webp' }), 'portada.webp');
      const uploaded = await fetch(`${panel.url}/admin/api/images/`, { method: 'POST', headers: { origin, cookie }, body: form });
      expect(uploaded.status).toBe(201);
      const { key, url, width, height } = (await uploaded.json()) as { key: string; url: string; width: number; height: number };
      expect([width, height]).toEqual([800, 600]);

      const project = { id: 'proyecto-con-portada', summary: 'Resumen ficticio', relation: 'own', disclosure: 'public', stack: ['TypeScript'], highlights: [], links: [] };
      const documents = {
        es: { projects: [{ ...project, title: 'Proyecto con portada', images: [{ key, alt: 'Portada ficticia', width, height }] }] },
        en: { projects: [{ ...project, title: 'Project with a cover', summary: 'Made-up summary', images: [{ key, alt: 'Fictional cover', width, height }] }] },
      };
      const saved = await fetch(`${panel.url}/admin/api/content/projects/`, {
        method: 'PUT',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ baseVersions: { es: 0, en: 0 }, documents }),
      });
      expect(saved.status).toBe(200);
      for (const [path, alt] of [['/', 'Portada ficticia'], ['/en/', 'Fictional cover']] as const) {
        const { doc, text } = await render(panel, PAGES.find((spec) => spec.path === path) as (typeof PAGES)[number]);
        const cover = doc.querySelector('#projects img');
        expect(cover?.getAttribute('src'), path).toBe(url);
        expect(cover?.getAttribute('alt'), path).toBe(alt);
        expect([cover?.getAttribute('width'), cover?.getAttribute('height')], path).toEqual(['800', '600']);
        expect(url.startsWith(`${MEDIA_ORIGIN}/`)).toBe(true);
        expect(text, path).not.toMatch(/\\?"key\\?":/);
      }
    } finally {
      await panel.stop();
      await adminApi.close();
    }
  }, 120_000);
});

describe('empty lists', () => {
  it('T50: an API with empty services, projects and architecture gives 200 on the 4 pages with the three empty texts in their language, no Ada content in them, JSON-LD, one h1 and no broken anchors', async () => {
    const emptyApi = await startFakeApi({ services: () => [], projects: () => [], architecture: () => EMPTY_ARCHITECTURE });
    const emptyServer = await startStandalone({ apiUrl: emptyApi.url });
    try {
      for (const spec of PAGES) {
        const result = await render(emptyServer, spec);
        const { doc, visible } = result;
        const own = dictionaries[spec.lang].empty;
        const other = dictionaries[otherOf(spec.lang)].empty;
        expect(result.status, spec.path).toBe(200);
        expect(visible, spec.path).toContain(own.projects);
        expect(visible, spec.path).toContain(own.architecture);
        expect(visible, spec.path).not.toContain(other.projects);
        expect(visible, spec.path).not.toContain(other.architecture);
        expect(visible, spec.path).not.toContain(other.services);
        if (spec.mode === 'services') expect(visible, spec.path).toContain(own.services);
        else expect(visible, spec.path).not.toContain(own.services);

        for (const project of projectsFor(spec.lang)) expect(visible, spec.path).not.toContain(project.title);
        if (spec.mode === 'services') for (const service of servicesFor(spec.lang)) expect(visible, spec.path).not.toContain(service.title);
        for (const port of architectureFor(spec.lang).ports) expect(visible, spec.path).not.toContain(port.name);
        expect(doc.querySelectorAll('[data-probe="node"], [data-probe="service-card"], aside'), spec.path).toHaveLength(0);

        expect(doc.querySelectorAll('h1'), spec.path).toHaveLength(1);
        expect(doc.querySelectorAll('script[type="application/ld+json"]'), spec.path).toHaveLength(1);
        for (const id of ['projects', 'contact']) expect(doc.getElementById(id), `${spec.path} #${id}`).not.toBeNull();
        if (spec.mode === 'services') expect(doc.getElementById('services'), spec.path).not.toBeNull();
        for (const a of Array.from(doc.querySelectorAll('a[href^="#"]'))) {
          const id = (a.getAttribute('href') ?? '').slice(1);
          expect(doc.getElementById(id), `${spec.path} #${id}`).not.toBeNull();
        }
      }
    } finally {
      await emptyServer.stop();
      await emptyApi.close();
    }
  }, 90_000);
});
