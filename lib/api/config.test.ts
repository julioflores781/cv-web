import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfig } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getConfig', () => {
  it('T6: an empty environment gives the in-network API and the public site', () => {
    expect(getConfig({})).toEqual({ apiUrl: 'http://cv-api:8080', siteUrl: 'https://floreslab.dev' });
  });

  it('T7: trailing slashes are removed from CV_API_URL and SITE_URL', () => {
    expect(getConfig({ CV_API_URL: 'http://api.example.test:9000///', SITE_URL: 'https://site.example.test/' })).toEqual({
      apiUrl: 'http://api.example.test:9000',
      siteUrl: 'https://site.example.test',
    });
  });

  it('T8: only apiUrl and siteUrl exist, and the old cache variables have no effect', () => {
    const plain = getConfig({});
    const withCache = getConfig({ CV_CACHE_DIR: '/somewhere', CV_CACHE_TTL_SECONDS: '60' });
    expect(Object.keys(withCache).sort()).toEqual(['apiUrl', 'siteUrl']);
    expect(withCache).toEqual(plain);
  });

  it('T9: the environment is read on every call, not when the module is imported', () => {
    vi.stubEnv('CV_API_URL', 'http://first.example.test');
    expect(getConfig().apiUrl).toBe('http://first.example.test');
    vi.stubEnv('CV_API_URL', 'http://second.example.test');
    vi.stubEnv('SITE_URL', 'https://second-site.example.test');
    expect(getConfig()).toEqual({ apiUrl: 'http://second.example.test', siteUrl: 'https://second-site.example.test' });
  });
});
