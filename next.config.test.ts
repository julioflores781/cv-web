import { describe, expect, it } from 'vitest';
import { resolveRoute, routePath } from './lib/i18n/routes';
import nextConfig from './next.config';

describe('next.config', () => {
  it('HS-T5 (T23, T240): standalone server, unoptimized images, trailing slash, no static export, exactly the two permanent redirects of the old services URLs and headers only on /admin', async () => {
    expect(nextConfig.output).toBe('standalone');
    expect(nextConfig.images?.unoptimized).toBe(true);
    expect(nextConfig.trailingSlash).toBe(true);
    expect(nextConfig.output).not.toBe('export');
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules).toEqual([
      { source: '/servicios/', destination: '/', permanent: true },
      { source: '/en/services/', destination: '/en/', permanent: true },
    ]);
    for (const rule of rules) {
      for (const key of ['statusCode', 'has', 'missing', 'basePath', 'locale']) expect(rule, `${rule.source} ${key}`).not.toHaveProperty(key);
    }
    expect(((await nextConfig.headers?.()) ?? []).map((rule) => rule.source)).toEqual(['/admin/:path*']);
  });

  it('HS-T6: each redirect has the trailing slash on both sides, hides no live page and lands on the services page of its language', async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.source.endsWith('/'), rule.source).toBe(true);
      expect(rule.destination.endsWith('/'), rule.destination).toBe(true);
      const segments = rule.source.split('/').filter(Boolean);
      expect(resolveRoute(segments), rule.source).toBeNull();
      const lang = segments[0] === 'en' ? 'en' : 'es';
      expect(rule.destination, rule.source).toBe(routePath({ lang, page: 'services' }));
    }
  });

  it('T240: /admin/:path* gets noindex, no-store, frame protection, no referrer and nosniff; nothing else gets headers', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.map((rule) => rule.source)).toEqual(['/admin/:path*']);
    const headers = Object.fromEntries((rules[0]?.headers ?? []).map(({ key, value }) => [key, value]));
    expect(headers).toEqual({
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  it('T418: project covers are plain <img> from the media origin: images stay unoptimized and no remotePatterns, domains nor loader are configured', () => {
    expect(nextConfig.images).toEqual({ unoptimized: true });
  });
});
