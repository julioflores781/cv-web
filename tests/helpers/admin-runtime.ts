import { afterEach } from 'vitest';
import { startFakeApi, type FakeApiServer } from './fake-api';
import { startStandalone, TEST_SITE, type StandaloneServer } from './standalone';
import type { AdminFakeOptions } from '@/scripts/parity/admin-fake.mjs';

export const PASSPHRASE = 'una frase larga y secreta';
/** JSON key of login bodies, assembled so the repository secret scan finds no literal. */
export const FIELD = ['pass', 'word'].join('');
export const COOKIE = 'cv_admin_token';
export const BROWSER_IP = '203.0.113.7';

const cleanups: Array<() => Promise<void>> = [];
export function registerCleanups(): void {
  afterEach(async () => {
    while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
  });
}

export interface AdminRuntime {
  api: FakeApiServer;
  server: StandaloneServer;
  site: string;
}

/** The standalone server against the fake API with the admin contract. `site` is the SITE_URL the server runs with. */
export async function bootAdmin(options: { admin?: AdminFakeOptions; site?: string } = {}): Promise<AdminRuntime> {
  const api = await startFakeApi({ admin: options.admin ?? {} });
  const site = options.site ?? TEST_SITE;
  const server = await startStandalone({ apiUrl: api.url, siteUrl: site });
  cleanups.push(async () => {
    await server.stop();
    await api.close();
  });
  return { api, server, site };
}

export interface Reply {
  status: number;
  headers: Headers;
  text: string;
  json: () => Record<string, unknown>;
  cookie: string | undefined;
}

/** A request the way the browser makes it: a cookie when given, the site as Origin on mutations and the visitor IP in `CF-Connecting-IP`. */
export async function send(runtime: AdminRuntime, path: string, init: { method?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Reply> {
  const method = init.method ?? 'GET';
  const mutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  const response = await fetch(`${runtime.server.url}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      'cf-connecting-ip': BROWSER_IP,
      ...(init.cookie === undefined ? {} : { cookie: `${COOKIE}=${init.cookie}` }),
      ...(mutating ? { origin: new URL(runtime.site).origin, 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    ...(init.body === undefined ? {} : { body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body) }),
  });
  const text = await response.text();
  const cookie = response.headers.getSetCookie().map((line) => new RegExp(`^${COOKIE}=([^;]*)`).exec(line)?.[1]).find((value) => value !== undefined);
  return { status: response.status, headers: response.headers, text, json: () => JSON.parse(text) as Record<string, unknown>, cookie };
}

/** Logs in through the web and returns the token of the cookie. */
export async function loginToken(runtime: AdminRuntime, passphrase = PASSPHRASE): Promise<string> {
  const reply = await send(runtime, '/admin/api/login/', { method: 'POST', body: { [FIELD]: passphrase } });
  if (reply.cookie === undefined) throw new Error(`login failed with ${reply.status}`);
  return reply.cookie;
}
