import { getConfig } from '@/lib/api/config';

/** The only place that knows the name of the session cookie (its value is the JWT of the admin API). Server only. */
const COOKIE_NAME = 'cv_admin_token';
const COOKIE_PATH = '/admin';
const MAX_TOKEN_LENGTH = 4096;
/** Printable ASCII without spaces: what a JWT is made of. Anything else is not a token. */
const TOKEN_SHAPE = /^[\x21-\x7e]+$/;

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: 'strict';
  path: typeof COOKIE_PATH;
  secure: boolean;
  maxAge: number;
}

/** What `NextResponse` (and any response with a `cookies` jar) offers for writing. */
export interface CookieWriter {
  cookies: { set(name: string, value: string, options: SessionCookieOptions): unknown };
}

/** What `NextRequest.cookies` and `await cookies()` offer for reading. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/**
 * `Secure` follows the PUBLIC scheme (`SITE_URL`), not the request: behind the tunnel the browser sees https while cloudflared talks plain
 * http to this server, so the request scheme says nothing. `null` when `expiresAt` is not a future instant (the login then counts as failed).
 */
export function sessionCookieOptions(expiresAt: string, now: number = Date.now()): SessionCookieOptions | null {
  const expires = Date.parse(expiresAt);
  const maxAge = Math.floor((expires - now) / 1000);
  if (Number.isNaN(expires) || maxAge <= 0) return null;
  return { ...baseOptions(), maxAge };
}

function baseOptions(): Omit<SessionCookieOptions, 'maxAge'> {
  return { httpOnly: true, sameSite: 'strict', path: COOKIE_PATH, secure: getConfig().siteUrl.startsWith('https:') };
}

/** Writes the token; `false` (nothing written) when `expiresAt` is unusable. */
export function applySession(response: CookieWriter, token: string, expiresAt: string, now: number = Date.now()): boolean {
  const options = sessionCookieOptions(expiresAt, now);
  if (options === null) return false;
  response.cookies.set(COOKIE_NAME, token, options);
  return true;
}

/** Deletes the cookie with the same attributes it was set with (otherwise the browser keeps it). */
export function clearSession(response: CookieWriter): void {
  response.cookies.set(COOKIE_NAME, '', { ...baseOptions(), maxAge: 0 });
}

/** The token of the cookie, or `undefined` when it is missing, empty, oversized or not shaped like a token. */
export function readToken(store: CookieReader): string | undefined {
  const value = store.get(COOKIE_NAME)?.value;
  return value !== undefined && value.length <= MAX_TOKEN_LENGTH && TOKEN_SHAPE.test(value) ? value : undefined;
}

/** Presence only (what `proxy.ts` needs): the API decides whether the token is any good, so garbage counts and an empty value does not. */
export function hasSessionCookie(store: CookieReader): boolean {
  return (store.get(COOKIE_NAME)?.value ?? '') !== '';
}
