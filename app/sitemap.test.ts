// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getConfig } from '@/lib/api';
import sitemap from './sitemap';

describe('sitemap', () => {
  it('HS-T15 (BA-T6, T87): lists exactly /, /perfil/, /en/ and /en/profile/ (no old services URL), each with the alternates of its pair, all on https://floreslab.dev by default', () => {
    const base = getConfig().siteUrl;
    const entries = sitemap();
    expect(entries.map((entry) => entry.url).sort()).toEqual([`${base}/`, `${base}/perfil/`, `${base}/en/`, `${base}/en/profile/`].sort());
    for (const entry of entries) expect(entry.url, entry.url).not.toMatch(/servicios|services/);
    const byUrl = new Map(entries.map((entry) => [entry.url, entry.alternates?.languages]));
    const servicesPair = { es: `${base}/`, en: `${base}/en/`, 'x-default': `${base}/` };
    const profilePair = { es: `${base}/perfil/`, en: `${base}/en/profile/`, 'x-default': `${base}/perfil/` };
    expect(byUrl.get(`${base}/`)).toEqual(servicesPair);
    expect(byUrl.get(`${base}/en/`)).toEqual(servicesPair);
    expect(byUrl.get(`${base}/perfil/`)).toEqual(profilePair);
    expect(byUrl.get(`${base}/en/profile/`)).toEqual(profilePair);

    const saved = process.env.SITE_URL;
    delete process.env.SITE_URL;
    try {
      const defaults = sitemap();
      expect(defaults).toHaveLength(4);
      const urls = defaults.flatMap((entry) => [entry.url, ...Object.values(entry.alternates?.languages ?? {})]);
      for (const url of urls) expect(String(url).startsWith('https://floreslab.dev/'), String(url)).toBe(true);
    } finally {
      if (saved !== undefined) process.env.SITE_URL = saved;
    }
  });
});
