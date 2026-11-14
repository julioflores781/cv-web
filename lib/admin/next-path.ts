export const DEFAULT_NEXT = '/admin/';
const MAX_LENGTH = 512;
// Backslashes and control characters, and the encodings of `/`, `\` and `.` that could rebuild what the other rules reject.
const FORBIDDEN = /[\\\u0000-\u001f\u007f]|%2f|%5c|%2e/i;

/** Where to go after the login: only a path of the panel (`/admin`, `/admin/...`) survives; anything else is `/admin/`. */
export function safeNext(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return DEFAULT_NEXT;
  if (!/^\/admin(?:[/?]|$)/.test(raw) || FORBIDDEN.test(raw)) return DEFAULT_NEXT;
  const path = raw.split('?')[0] as string;
  if (path.includes('//') || path.split('/').includes('..')) return DEFAULT_NEXT;
  return raw;
}

/** The login page a dead session is sent to, remembering where it was. */
export function expiredLoginUrl(path: string): string {
  return `/admin/login/?expired=1&next=${encodeURIComponent(path)}`;
}

/**
 * Request header through which `proxy.ts` tells the panel layout which page was asked for (a layout cannot read the URL). The proxy always
 * overwrites it, so a value sent by the browser never arrives; the layout still passes it through `safeNext`.
 */
export const PANEL_PATH_HEADER = 'x-admin-path';

/** Path and query of a panel request, without the `_rsc` cache-busting parameter of client navigations. */
export function panelPath(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete('_rsc');
  const query = params.toString();
  return `${url.pathname}${query === '' ? '' : `?${query}`}`;
}
