// @vitest-environment node
import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('T87: with the default siteUrl, allows / and points to the sitemap of https://floreslab.dev', () => {
    const saved = process.env.SITE_URL;
    delete process.env.SITE_URL;
    try {
      const result = robots();
      expect(result.rules).toEqual({ userAgent: '*', allow: '/' });
      expect(result.sitemap).toBe('https://floreslab.dev/sitemap.xml');
    } finally {
      if (saved !== undefined) process.env.SITE_URL = saved;
    }
  });
});
