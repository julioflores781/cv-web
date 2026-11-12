type EnvVars = Record<string, string | undefined>;

export interface Config {
  apiUrl: string;
  siteUrl: string;
}

const DEFAULT_API_URL = 'http://cv-api:8080';
const DEFAULT_SITE_URL = 'https://floreslab.dev';

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** The only place that reads the environment. Read on every call (runtime), never at import time. */
export function getConfig(env: EnvVars = process.env): Config {
  return {
    apiUrl: trimTrailingSlashes(env.CV_API_URL || DEFAULT_API_URL),
    siteUrl: trimTrailingSlashes(env.SITE_URL || DEFAULT_SITE_URL),
  };
}
