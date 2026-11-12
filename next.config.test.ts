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
});
