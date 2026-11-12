// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getConfig } from '@/lib/api';
import sitemap from './sitemap';

describe('sitemap', () => {
  it('T87: with the default siteUrl, every url and alternate starts with https://floreslab.dev', () => {
    const saved = process.env.SITE_URL;
    delete process.env.SITE_URL;
    try {
      const entries = sitemap();
      expect(entries).toHaveLength(4);
      const urls = entries.flatMap((entry) => [entry.url, ...Object.values(entry.alternates?.languages ?? {})]);
      for (const url of urls) expect(String(url).startsWith('https://floreslab.dev/')).toBe(true);
    } finally {
      if (saved !== undefined) process.env.SITE_URL = saved;
    }
  });

  it('BA-T6: lists the 4 pages and each one alternates to its counterpart in the other language', () => {
    const base = getConfig().siteUrl;
    const entries = sitemap();
    expect(entries.map((entry) => entry.url).sort()).toEqual(
      [`${base}/`, `${base}/servicios/`, `${base}/en/`, `${base}/en/services/`].sort(),
    );
    const byUrl = new Map(entries.map((entry) => [entry.url, entry.alternates?.languages]));
    expect(byUrl.get(`${base}/`)).toMatchObject({ es: `${base}/`, en: `${base}/en/` });
    expect(byUrl.get(`${base}/en/`)).toMatchObject({ es: `${base}/`, en: `${base}/en/` });
    expect(byUrl.get(`${base}/servicios/`)).toMatchObject({ es: `${base}/servicios/`, en: `${base}/en/services/` });
    expect(byUrl.get(`${base}/en/services/`)).toMatchObject({ es: `${base}/servicios/`, en: `${base}/en/services/` });
  });
});
