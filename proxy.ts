import { NextResponse, type NextRequest } from 'next/server';
import { PANEL_PATH_HEADER, panelPath } from '@/lib/admin/next-path';
import { clearSession, hasSessionCookie } from '@/lib/admin/session';

const LOGIN = '/admin/login';
const LOGIN_API = '/admin/api/login';
const NO_STORE = { 'Cache-Control': 'no-store' };
/** Panel pages are only read: the panel writes through its route handlers, never through a POST to a page. */
const PAGE_METHODS = new Set(['GET', 'HEAD']);

/** Next only accepts an absolute URL here, so the request's own origin is reused (host and scheme as the browser addressed them). */
function redirect(request: NextRequest, pathname: string, search = ''): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  const response = NextResponse.redirect(url, 307);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Lets a page request through, telling the panel layout which page it is (so a dead session returns there after the login). */
function passPage(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set(PANEL_PATH_HEADER, panelPath(request.nextUrl));
  return NextResponse.next({ request: { headers } });
}

/**
 * The gate of `/admin/*`. It only looks for the presence of the session cookie; it never decodes the token. The API is the authority
 * (the panel layout and every handler ask it), so a forged or dead cookie gets no further than the first call. No log line per visit.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const path = pathname.replace(/\/+$/, '') || '/';
  const present = hasSessionCookie(request.cookies);
  const isApi = path === '/admin/api' || path.startsWith('/admin/api/');

  // A page answers GET and HEAD only: anything else would render it as if it had been read (there are no Server Actions in the panel).
  if (!isApi && !PAGE_METHODS.has(request.method)) {
    return new NextResponse(null, { status: 405, headers: { ...NO_STORE, Allow: 'GET, HEAD' } });
  }

  if (!present) {
    // Any method of the login handler passes: it answers 405 itself for the ones it does not take.
    if (path === LOGIN || path === LOGIN_API) return NextResponse.next();
    if (isApi) return NextResponse.json({ code: 'ADMIN_UNAUTHORIZED' }, { status: 401, headers: NO_STORE });
    return redirect(request, `${LOGIN}/`, `?next=${encodeURIComponent(panelPath(request.nextUrl))}`);
  }
  if (path === LOGIN) {
    if (request.nextUrl.searchParams.get('expired') !== '1') return redirect(request, '/admin/');
    // The API said the token is dead and the layout sent the browser here: drop the cookie, which a Server Component cannot do.
    const response = NextResponse.next();
    clearSession(response);
    return response;
  }
  return isApi ? NextResponse.next() : passPage(request);
}

/**
 * Every `/admin` path except the image handlers (`/admin/api/images` and below). When the proxy runs on a request, Next clones its body for
 * it and reads it to the end before the route handler starts (up to 10 MB kept, the rest read and dropped, with a plain-text warning in the
 * log): the upload's own early 413 would only reach the browser after the whole body was sent. Those handlers do not need the gate: they
 * ask for the session themselves (401 without cookie), check Origin and send `no-store`; `next.config.ts` adds the panel headers.
 */
export const config = { matcher: ['/admin', '/admin/((?!api/images(?:/|$)).*)'] };
