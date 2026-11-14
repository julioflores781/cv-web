// @vitest-environment node
import { describe, expect, it } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';

describe('robots', () => {
  it('T87/T241: with the default siteUrl, allows / and points to the sitemap of https://floreslab.dev', () => {
    const saved = process.env.SITE_URL;
    delete process.env.SITE_URL;
    try {
      const result = robots();
      expect(result.rules).toEqual({ userAgent: '*', allow: '/', disallow: '/admin/' });
      expect(result.sitemap).toBe('https://floreslab.dev/sitemap.xml');
    } finally {
      if (saved !== undefined) process.env.SITE_URL = saved;
    }
  });

  it('T241: the sitemap lists no panel route', () => {
    const entries = sitemap();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((entry) => entry.url.includes('/admin'))).toEqual([]);
    expect(robots().sitemap).toMatch(/\/sitemap\.xml$/);
  });
});
