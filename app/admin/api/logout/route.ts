import { NextResponse } from 'next/server';
import { adminRoute, notAllowed } from '@/lib/admin/handler';
import { clearSession } from '@/lib/admin/session';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * Closes this browser's session by deleting the cookie. Idempotent and local: the API has no «logout one» operation, so the token stays valid
 * until it expires (that is what «cerrar todas» is for).
 */
export const POST = adminRoute({ mutating: true, auth: false }, (ctx) => {
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  logEvent('info', 'admin_logout', { request_id: ctx.requestId, status: 200 });
  return response;
});

export const GET = notAllowed('POST');
export const PUT = notAllowed('POST');
export const PATCH = notAllowed('POST');
export const DELETE = notAllowed('POST');
export const OPTIONS = notAllowed('POST');
