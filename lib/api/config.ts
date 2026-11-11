import path from 'node:path';

type EnvVars = Record<string, string | undefined>;

export interface Config {
  apiUrl: string;
  siteUrl: string;
  cacheDir: string;
}

const DEFAULT_API_URL = 'https://cv-api.floreslab.dev';
const DEFAULT_SITE_URL = 'https://cv.floreslab.dev';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Directory of the build fallback copy; `.next/cache` is what Cloudflare Pages persists between builds. */
export function resolveCacheDir(env: EnvVars = process.env, cwd: string = process.cwd()): string {
  return env.CV_CACHE_DIR ? path.resolve(env.CV_CACHE_DIR) : path.join(cwd, '.next', 'cache', 'cv-web');
}

/** The only place that reads the environment. */
export function getConfig(env: EnvVars = process.env): Config {
  return {
    apiUrl: trimTrailingSlashes(env.CV_API_URL || DEFAULT_API_URL),
    siteUrl: trimTrailingSlashes(env.SITE_URL || DEFAULT_SITE_URL),
    cacheDir: resolveCacheDir(env),
  };
}
