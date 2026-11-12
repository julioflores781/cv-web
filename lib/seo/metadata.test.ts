// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { getConfig } from '@/lib/api';
import { buildMetadata } from './metadata';

const SITE = 'https://cv.example.test';
const profileEs = { lang: 'es', page: 'profile' } as const;
const profileEn = { lang: 'en', page: 'profile' } as const;
const servicesEs = { lang: 'es', page: 'services' } as const;
const servicesEn = { lang: 'en', page: 'services' } as const;

describe('buildMetadata', () => {
  it('T87: with the default siteUrl, canonical, alternates and Open Graph urls start with https://floreslab.dev', () => {
    const { siteUrl } = getConfig({});
    expect(siteUrl).toBe('https://floreslab.dev');
    for (const [resume, route] of [[resumeEs, profileEs], [resumeEs, servicesEs], [resumeEn, profileEn], [resumeEn, servicesEn]] as const) {
      const meta = buildMetadata(resume, route, siteUrl);
      const urls = [meta.alternates?.canonical, ...Object.values(meta.alternates?.languages ?? {}), (meta.openGraph as { url?: string }).url];
      expect(urls).toHaveLength(5);
      for (const url of urls) expect(String(url).startsWith('https://floreslab.dev/')).toBe(true);
    }
  });

  it('BA-T4: the ES services page has its own title and description, canonical SITE/servicios/ and alternate SITE/en/services/', () => {
    const services = buildMetadata(resumeEs, servicesEs, SITE);
    const profile = buildMetadata(resumeEs, profileEs, SITE);
    expect(services.title).toContain('Ada Ejemplo');
    expect(services.title).not.toBe(profile.title);
    expect(services.description).toBeTruthy();
    expect(services.description).not.toBe(profile.description);
    expect(services.alternates?.canonical).toBe(`${SITE}/servicios/`);
    expect(services.alternates?.languages).toEqual({
      es: `${SITE}/servicios/`,
      en: `${SITE}/en/services/`,
      'x-default': `${SITE}/servicios/`,
    });
    expect(services.openGraph).toMatchObject({ url: `${SITE}/servicios/`, title: services.title, description: services.description });
  });

  it('BA-T5: the EN profile has canonical SITE/en/, og:locale en_US and the es_ES alternate', () => {
    const en = buildMetadata(resumeEn, profileEn, SITE);
    expect(en.alternates?.canonical).toBe(`${SITE}/en/`);
    expect(en.openGraph).toMatchObject({ locale: 'en_US', alternateLocale: ['es_ES'], url: `${SITE}/en/` });
    expect(buildMetadata(resumeEs, profileEs, SITE).openGraph).toMatchObject({ locale: 'es_ES', alternateLocale: ['en_US'] });
    expect(buildMetadata(resumeEn, servicesEn, SITE).alternates?.canonical).toBe(`${SITE}/en/services/`);
  });

  it('T29: the ES profile title has name and label, description is <=160 chars, canonical is SITE/', () => {
    const meta = buildMetadata(resumeEs, profileEs, SITE);
    expect(meta.title).toContain('Ada Ejemplo');
    expect(meta.title).toContain(resumeEs.profile.label);
    expect(meta.description?.length).toBeGreaterThan(0);
    expect(meta.description?.length).toBeLessThanOrEqual(160);
    expect(meta.alternates?.canonical).toBe(`${SITE}/`);
  });

  it('T31: the profile alternates include es, en and x-default in both languages', () => {
    for (const [resume, route] of [[resumeEs, profileEs], [resumeEn, profileEn]] as const) {
      expect(buildMetadata(resume, route, SITE).alternates?.languages).toEqual({
        es: `${SITE}/`,
        en: `${SITE}/en/`,
        'x-default': `${SITE}/`,
      });
    }
  });

  it('T32: without summary or tagline the description falls back to a text built from name and label', () => {
    const meta = buildMetadata(minimalResume('en'), profileEn, SITE);
    expect(meta.description).toContain('Ada Ejemplo');
    expect(meta.description).toContain('Ingeniera de ejemplo');
    expect(meta.description?.trim()).not.toBe('');
  });

  it('extra: a very long summary is clipped to 160 characters', () => {
    const long = { ...resumeEs, profile: { ...resumeEs.profile, summary: 'palabra '.repeat(80) } };
    const description = buildMetadata(long, profileEs, SITE).description ?? '';
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.endsWith('…')).toBe(true);
  });
});
