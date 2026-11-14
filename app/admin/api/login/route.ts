import { NextResponse } from 'next/server';
import { adminLogin } from '@/lib/api/admin';
import { adminRoute, errorResponse, failure, notAllowed, readJsonObject, type RouteContext } from '@/lib/admin/handler';
import { applySession } from '@/lib/admin/session';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;
const MAX_SECRET_LENGTH = 1024;

function outcomeOf(response: Response): string {
  if (response.status === 200) return 'ok';
  if (response.status === 401 || response.status === 400) return 'invalid';
  if (response.status === 429) return response.headers.has('Retry-After') ? 'locked' : 'rate_limited';
  return 'unavailable';
}

/** Password login. Bad input and a wrong password look the same (same code, same text); the token only travels in the cookie. */
export const POST = adminRoute({ mutating: true, auth: false }, async (ctx: RouteContext) => {
  const finish = (response: NextResponse): NextResponse => {
    const outcome = outcomeOf(response);
    logEvent(outcome === 'unavailable' ? 'warn' : 'info', 'admin_login', { request_id: ctx.requestId, outcome, status: response.status });
    return response;
  };

  const body = await readJsonObject(ctx.request, MAX_BODY_BYTES);
  const secret = body?.password;
  if (typeof secret !== 'string' || secret.length === 0 || secret.length > MAX_SECRET_LENGTH) {
    return finish(errorResponse(ctx, 400, 'ADMIN_INVALID_CREDENTIALS'));
  }
  const result = await adminLogin(secret, { requestId: ctx.requestId, clientIp: ctx.clientIp });
  if (result.kind === 'ok') {
    const response = NextResponse.json({ ok: true });
    // An expiry that is not in the future means the API broke its contract: the login does not count.
    return applySession(response, result.data.accessToken, result.data.expiresAt) ? finish(response) : finish(errorResponse(ctx, 502, 'ADMIN_UPSTREAM'));
  }
  // A 401 here is a wrong password, not a dead session, so it must not go through `failure` (which would clear a cookie and say «expired»).
  if (result.kind === 'problem' && (result.status === 401 || result.status === 400)) return finish(errorResponse(ctx, 401, 'ADMIN_INVALID_CREDENTIALS'));
  return finish(failure(ctx, result));
});

export const GET = notAllowed('POST');
export const PUT = notAllowed('POST');
export const PATCH = notAllowed('POST');
export const DELETE = notAllowed('POST');
export const OPTIONS = notAllowed('POST');
