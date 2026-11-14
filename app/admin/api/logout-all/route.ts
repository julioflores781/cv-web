import { NextResponse } from 'next/server';
import { adminLogoutAll } from '@/lib/api/admin';
import { adminRoute, failure, notAllowed } from '@/lib/admin/handler';
import { clearSession } from '@/lib/admin/session';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** Invalidates every session in the API, then drops the cookie. If the API cannot be reached the session is kept, so the user can retry. */
export const POST = adminRoute({ mutating: true, auth: true }, async (ctx) => {
  const result = await adminLogoutAll({ token: ctx.token, requestId: ctx.requestId, clientIp: ctx.clientIp });
  if (result.kind === 'ok') {
    const response = NextResponse.json({ ok: true });
    clearSession(response);
    logEvent('info', 'admin_logout_all', { request_id: ctx.requestId, outcome: 'ok', status: 200 });
    return response;
  }
  const response = failure(ctx, result);
  logEvent('warn', 'admin_logout_all', { request_id: ctx.requestId, outcome: result.kind === 'problem' && result.status === 401 ? 'expired' : 'unavailable', status: response.status });
  return response;
});

export const GET = notAllowed('POST');
export const PUT = notAllowed('POST');
export const PATCH = notAllowed('POST');
export const DELETE = notAllowed('POST');
export const OPTIONS = notAllowed('POST');
