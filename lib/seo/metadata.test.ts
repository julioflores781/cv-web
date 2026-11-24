// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { getConfig } from '@/lib/api';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { interpolate } from '@/lib/i18n/format';
import { buildMetadata } from './metadata';

const SITE = 'https://cv.example.test';
const profileEs = { lang: 'es', page: 'profile' } as const;
const profileEn = { lang: 'en', page: 'profile' } as const;
const servicesEs = { lang: 'es', page: 'services' } as const;
const servicesEn = { lang: 'en', page: 'services' } as const;

describe('buildMetadata', () => {
  it('HS-T13 (BA-T4, BA-T5, T29, T31, T87): the home / gets the services title and description; each page has its own canonical, the hreflang set of its pair and og:url = canonical', () => {
    // Services ES, now the home page: services title and description, canonical SITE/ and the services pair as alternates.
    const services = buildMetadata(resumeEs, servicesEs, SITE);
    const profile = buildMetadata(resumeEs, profileEs, SITE);
    const { title, description } = getDictionary('es').meta.services;
    expect(services.title).toBe(interpolate(title, { name: 'Ada Ejemplo' }));
    expect(services.title).not.toBe(profile.title);
    expect(services.description).toBe(description);
    expect(services.description).not.toBe(profile.description);
    expect(services.alternates?.canonical).toBe(`${SITE}/`);
    expect(services.alternates?.languages).toEqual({ es: `${SITE}/`, en: `${SITE}/en/`, 'x-default': `${SITE}/` });
    expect(services.openGraph).toMatchObject({ url: `${SITE}/`, title: services.title, description: services.description });
    expect(buildMetadata(resumeEn, servicesEn, SITE).alternates?.canonical).toBe(`${SITE}/en/`);

    // Profile ES: name and label in the title, a description of at most 160 characters, canonical SITE/perfil/.
    expect(profile.title).toContain('Ada Ejemplo');
    expect(profile.title).toContain(resumeEs.profile.label);
    expect(profile.description?.length).toBeGreaterThan(0);
    expect(profile.description?.length).toBeLessThanOrEqual(160);
    expect(profile.alternates?.canonical).toBe(`${SITE}/perfil/`);
    expect(profile.openGraph).toMatchObject({ url: `${SITE}/perfil/`, locale: 'es_ES', alternateLocale: ['en_US'] });
    for (const [resume, route] of [[resumeEs, profileEs], [resumeEn, profileEn]] as const) {
      expect(buildMetadata(resume, route, SITE).alternates?.languages, route.lang).toEqual({
        es: `${SITE}/perfil/`,
        en: `${SITE}/en/profile/`,
        'x-default': `${SITE}/perfil/`,
      });
    }

    // Profile EN: canonical SITE/en/profile/, og:locale en_US and the es_ES alternate.
    const en = buildMetadata(resumeEn, profileEn, SITE);
    expect(en.alternates?.canonical).toBe(`${SITE}/en/profile/`);
    expect(en.openGraph).toMatchObject({ locale: 'en_US', alternateLocale: ['es_ES'], url: `${SITE}/en/profile/` });

    // With the default siteUrl, the 5 URLs of each page start with https://floreslab.dev/.
    const { siteUrl } = getConfig({});
    expect(siteUrl).toBe('https://floreslab.dev');
    for (const [resume, route] of [[resumeEs, profileEs], [resumeEs, servicesEs], [resumeEn, profileEn], [resumeEn, servicesEn]] as const) {
      const meta = buildMetadata(resume, route, siteUrl);
      const urls = [meta.alternates?.canonical, ...Object.values(meta.alternates?.languages ?? {}), (meta.openGraph as { url?: string }).url];
      expect(urls).toHaveLength(5);
      for (const url of urls) expect(String(url).startsWith('https://floreslab.dev/'), `${route.lang} ${route.page} ${String(url)}`).toBe(true);
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
