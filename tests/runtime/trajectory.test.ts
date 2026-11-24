// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Resume } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { careerResume } from '@/tests/fixtures/resume';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { SENTINELS, startFakeApi } from '@/tests/helpers/fake-api';
import { type TestServer } from '@/tests/helpers/http-server';
import { PAGES, assetUrls, get, getRsc, render } from '@/tests/helpers/runtime-pages';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';

// Routes come from PAGES (by mode and language), never written by hand: moving the URLs must not touch this file.
const PROFILES = PAGES.filter((spec) => spec.mode === 'profile');
const SERVICES = PAGES.filter((spec) => spec.mode === 'services');

/** A phase without its title: the whole resume is invalid. */
function brokenResume(lang: Lang): Record<string, unknown> {
  const base = careerResume(lang);
  const [first, ...rest] = base.experience;
  return { ...base, experience: [{ ...first, phases: [{ client: 'Cliente Ejemplo Uno' }] }, ...rest] };
}

/** Private sentinels inside a phase, a job and an education entry, where an API could slip them. */
function sentinelResume(lang: Lang): Record<string, unknown> {
  const base = careerResume(lang);
  const [first, ...rest] = base.experience;
  return {
    ...base,
    experience: [
      { ...first, birthDate: SENTINELS.birthDate, phases: (first?.phases ?? []).map((phase, i) => (i === 0 ? { ...phase, phone: SENTINELS.phone } : phase)) },
      ...rest,
    ],
    education: { ...base.education, certificates: base.education.certificates.map((item) => ({ ...item, dni: SENTINELS.dni })) },
  };
}

type Variant = 'career' | 'broken' | 'sentinel';
const VARIANTS: Record<Variant, (lang: Lang) => unknown> = { career: careerResume, broken: brokenResume, sentinel: sentinelResume };

let variant: Variant = 'career';
let api: TestServer;
let server: StandaloneServer;

beforeAll(async () => {
  // No cache: every request reads the API, so one server serves the three variants.
  api = await startFakeApi({ resume: (lang) => VARIANTS[variant](lang) });
  server = await startStandalone({ apiUrl: api.url });
}, 120_000);

afterAll(async () => {
  await server?.stop();
  await api?.close();
});

const phaseTexts = (section: Element) =>
  Array.from(section.querySelectorAll('ul'))
    .filter((ul) => ul.closest('details') === null)
    .flatMap((ul) => Array.from(ul.querySelectorAll('li')).map((li) => (li.textContent ?? '').trim()));

describe('runtime: experience and education (web-trajectory-split)', () => {
  it('TR-T22: with careerResume the profiles answer 200 with every job, two filled markers, phases outside <details>, one closed <details> with «Ver logros (3)» and its achievements in the server HTML, and only the education columns with data', async () => {
    variant = 'career';
    expect(PROFILES).toHaveLength(2);
    for (const spec of PROFILES) {
      const resume: Resume = careerResume(spec.lang);
      const dict = dictionaries[spec.lang];
      const { status, doc, text } = await render(server, spec);
      expect(status, spec.path).toBe(200);
      const experience = doc.querySelector('section#experience') as Element;
      expect(experience, spec.path).not.toBeNull();
      expect(experience.querySelectorAll('ol > li'), spec.path).toHaveLength(resume.experience.length);
      expect(experience.querySelectorAll('[data-probe="timeline-marker"]'), spec.path).toHaveLength(2);
      expect(Array.from(experience.querySelectorAll('ol > li h3')).map((h3) => h3.textContent), spec.path).toEqual(
        resume.experience.map((job) => `${job.position} · ${job.company}`),
      );

      const phases = resume.experience.flatMap((job) => job.phases.map((phase) => [phase.title, phase.client].filter(Boolean).join(' · ')));
      expect(phaseTexts(experience), spec.path).toEqual(phases);

      const withAchievements = resume.experience.filter((job) => job.highlights.length > 0);
      const details = Array.from(experience.querySelectorAll('details'));
      expect(details, spec.path).toHaveLength(withAchievements.length);
      for (const [i, disclosure] of details.entries()) {
        expect(disclosure.hasAttribute('open'), spec.path).toBe(false);
        expect(disclosure.firstElementChild?.tagName, spec.path).toBe('SUMMARY');
        expect(disclosure.firstElementChild?.textContent, spec.path).toBe(spec.lang === 'es' ? 'Ver logros (3)' : 'See achievements (3)');
        // Server-rendered: the achievements are already in the HTML, without JavaScript.
        const highlights = withAchievements[i]?.highlights ?? [];
        expect(Array.from(disclosure.querySelectorAll('li')).map((li) => li.textContent), spec.path).toEqual(highlights);
        for (const highlight of highlights) expect(text, spec.path).toContain(highlight);
      }

      const education = doc.querySelector('section#education') as Element;
      expect(education, spec.path).not.toBeNull();
      expect(Array.from(education.querySelectorAll('h3')).map((h3) => h3.textContent), spec.path).toEqual([dict.education.certificates, dict.education.courses]);
      expect(education.querySelector('ol, details'), spec.path).toBeNull();
    }
  }, 60_000);

  it('TR-T23: with the same API the services pages have no #experience, #education nor achievements disclosure', async () => {
    variant = 'career';
    expect(SERVICES).toHaveLength(2);
    for (const spec of SERVICES) {
      const { status, doc, visible } = await render(server, spec);
      expect(status, spec.path).toBe(200);
      expect(doc.querySelector('#experience, #education, details, summary'), spec.path).toBeNull();
      for (const highlight of careerResume(spec.lang).experience.flatMap((job) => job.highlights)) expect(visible, spec.path).not.toContain(highlight);
    }
  }, 60_000);

  it('TR-T24: a resume with a phase without title makes the 4 pages a 500 with no Ada data nor internals; once the API is valid again the next request is a 200', async () => {
    variant = 'broken';
    try {
      for (const spec of PAGES) {
        const result = await get(server, spec.path);
        expect(result.status, spec.path).toBe(500);
        for (const leak of ['Ada Ejemplo', 'Fase Alfa', 'Phase Alpha', 'cv-api', 'ECONNREFUSED', api.url, new URL(api.url).host]) expect(result.text, `${spec.path} ${leak}`).not.toContain(leak);
        expect(result.text, spec.path).not.toMatch(/\n\s+at /);
      }
    } finally {
      variant = 'career';
    }
    for (const spec of PAGES) expect((await get(server, spec.path)).status, spec.path).toBe(200);
  }, 60_000);

  it('TR-T25: sentinels inside a phase, a job and an education entry reach no HTML, RSC payload nor JS chunk of the 4 pages; the profile RSC does carry a phase title', async () => {
    variant = 'sentinel';
    try {
      const bodies: Array<[string, string]> = [];
      for (const spec of PAGES) {
        const result = await render(server, spec);
        expect(result.status, spec.path).toBe(200);
        bodies.push([spec.path, result.text]);
        const rsc = await getRsc(server, spec.path);
        // Positive control: the payload carries the new data, so the absences below mean something.
        if (spec.mode === 'profile') expect(rsc, `${spec.path} (RSC)`).toContain(careerResume(spec.lang).experience[0]?.phases[0]?.title as string);
        bodies.push([`${spec.path} (RSC)`, rsc]);
        for (const src of assetUrls(result.doc, 'script[src]')) bodies.push([src, (await get(server, src)).text]);
      }
      expect(bodies.length).toBeGreaterThan(8);
      const offenders = bodies.filter(([, body]) => Object.values(SENTINELS).some((value) => body.includes(value))).map(([name]) => name);
      expect(offenders).toEqual([]);
    } finally {
      variant = 'career';
    }
  }, 90_000);
});
