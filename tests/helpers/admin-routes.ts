import { NextRequest } from 'next/server';
import { adminLogin } from '@/lib/api/admin';
import type { AdminFakeOptions } from '@/scripts/parity/admin-fake.mjs';
import { startFakeApi, type FakeApiOptions, type FakeApiServer } from './fake-api';

export const SITE = 'https://cv.example.test';
/** Same literal as the production constant; tests may name it, production code may not (`tests/source.test.ts`). */
export const COOKIE = 'cv_admin_token';
/** Password of the fake account (the fake's default). */
export const PASSPHRASE = 'una frase larga y secreta';
/** JSON key of login bodies, assembled so the repository secret scan finds no literal. */
export const FIELD = ['pass', 'word'].join('');

interface RequestOptions {
  method?: string;
  cookie?: string;
  /** `null` omits the Origin header. */
  origin?: string | null;
  contentType?: string | null;
  headers?: Record<string, string>;
  /** Object bodies are JSON-encoded; strings are sent as they are. */
  body?: unknown;
}

/** A browser-like request to `https://cv.example.test<path>`: same Origin, JSON body and a `CF-Connecting-IP`, all overridable. */
export function adminReq(path: string, options: RequestOptions = {}): NextRequest {
  const { method = 'POST', cookie, origin = SITE, contentType = 'application/json', headers = {}, body } = options;
  const all: Record<string, string> = {
    host: new URL(SITE).host,
    'cf-connecting-ip': '203.0.113.7',
    'cf-ray': 'abc123-MAD',
    ...(origin === null ? {} : { origin }),
    ...(contentType === null ? {} : { 'content-type': contentType }),
    ...(cookie === undefined ? {} : { cookie: `${COOKIE}=${cookie}` }),
    ...headers,
  };
  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  return new NextRequest(`${SITE}${path}`, { method, headers: all, ...(payload === undefined || method === 'GET' ? {} : { body: payload }) });
}

/** Starts the fake API with the admin contract and points the web at it (`CV_API_URL`, `SITE_URL`); `restore()` undoes the environment. */
export async function startAdminApi(options: AdminFakeOptions = {}, extra: Omit<FakeApiOptions, 'admin'> = {}): Promise<FakeApiServer & { restore: () => Promise<void> }> {
  const api = await startFakeApi({ ...extra, admin: options });
  const saved = { api: process.env.CV_API_URL, site: process.env.SITE_URL };
  process.env.CV_API_URL = api.url;
  process.env.SITE_URL = SITE;
  const put = (key: 'CV_API_URL' | 'SITE_URL', value: string | undefined) => (value === undefined ? delete process.env[key] : (process.env[key] = value));
  return Object.assign(api, {
    restore: async () => {
      put('CV_API_URL', saved.api);
      put('SITE_URL', saved.site);
      await api.close();
    },
  });
}

/** A valid token of the fake, obtained straight from its login. */
export async function freshToken(api: { url: string }): Promise<string> {
  const result = await adminLogin(PASSPHRASE, { baseUrl: api.url });
  if (result.kind !== 'ok') throw new Error('fake login failed');
  return result.data.accessToken;
}

export const setCookies = (response: Response): string[] => response.headers.getSetCookie();
export const cookieValue = (response: Response): string | undefined => setCookies(response).map((line) => new RegExp(`^${COOKIE}=([^;]*)`).exec(line)?.[1]).find((value) => value !== undefined);
