import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('next.config', () => {
  it('T23: standalone server, unoptimized images, trailing slash, no static export and no redirects', () => {
    expect(nextConfig.output).toBe('standalone');
    expect(nextConfig.images?.unoptimized).toBe(true);
    expect(nextConfig.trailingSlash).toBe(true);
    expect(nextConfig).not.toHaveProperty('redirects');
    expect(nextConfig.output).not.toBe('export');
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
    expect(nextConfig).not.toHaveProperty('redirects');
  });

  it('T418: project covers are plain <img> from the media origin: images stay unoptimized and no remotePatterns, domains nor loader are configured', () => {
    expect(nextConfig.images).toEqual({ unoptimized: true });
  });
});
