// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { getConfig } from '@/lib/api';
import { buildPersonJsonLd, serializeJsonLd } from './json-ld';

const SITE = 'https://cv.example.test';

describe('buildPersonJsonLd', () => {
  it('HS-T14 (T87, BA-T7 T33): Person.url is the profile of the language (SITE/perfil/, SITE/en/profile/), with the public fields only and no email, telephone, birthDate nor taxID', () => {
    const { siteUrl } = getConfig({});
    expect(buildPersonJsonLd(resumeEs, 'es', siteUrl).url).toBe('https://floreslab.dev/perfil/');
    expect(buildPersonJsonLd(resumeEn, 'en', siteUrl).url).toBe('https://floreslab.dev/en/profile/');
    expect(buildPersonJsonLd(resumeEs, 'es', SITE).url).toBe(`${SITE}/perfil/`);
    const ld = buildPersonJsonLd(resumeEn, 'en', SITE);
    expect(ld).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: 'Ada Ejemplo',
      jobTitle: resumeEn.profile.label,
      url: `${SITE}/en/profile/`,
      inLanguage: 'en',
    });
    expect(ld.sameAs).toEqual(['https://www.linkedin.com/in/ada-ejemplo', 'https://github.com/ada-ejemplo']);
    for (const [resume, lang] of [[resumeEs, 'es'], [resumeEn, 'en']] as const) {
      const out = serializeJsonLd(buildPersonJsonLd(resume, lang, SITE));
      expect(out, lang).not.toMatch(/telephone|birthDate|taxID/);
      expect(out, lang).not.toContain(resume.contact.email);
    }
  });

  it('BA-T7 (T34): a name containing </script> cannot close the script tag', () => {
    const evil = { ...resumeEs, profile: { ...resumeEs.profile, name: 'Ada </script><script>alert(1)</script>' } };
    const out = serializeJsonLd(buildPersonJsonLd(evil, 'es', SITE));
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<');
    expect(JSON.parse(out).name).toBe(evil.profile.name);
  });

  it('BA-T7 (T35): no telephone, birthDate or taxID keys, and no email', () => {
    const out = serializeJsonLd(buildPersonJsonLd(resumeEs, 'es', SITE));
    const keys = Object.keys(JSON.parse(out) as object);
    expect(keys).not.toEqual(expect.arrayContaining(['telephone']));
    expect(out).not.toMatch(/telephone|birthDate|taxID/);
    expect(out).not.toContain(resumeEs.contact.email);
  });

  it('extra: non-http profile URLs are left out of sameAs', () => {
    const resume = {
      ...resumeEs,
      contact: { ...resumeEs.contact, profiles: [{ network: 'X', url: 'javascript:alert(1)' }] },
    };
    expect(buildPersonJsonLd(resume, 'es', SITE).sameAs).toEqual([]);
  });
});
