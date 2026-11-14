import { NextResponse } from 'next/server';
import { adminChangePassword } from '@/lib/api/admin';
import { adminRoute, errorResponse, failure, notAllowed, readJsonObject } from '@/lib/admin/handler';
import { applySession } from '@/lib/admin/session';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;
const MAX_SECRET_LENGTH = 1024;
const OUTCOMES: Record<number, string> = { 401: 'expired', 403: 'wrong_current', 422: 'weak', 429: 'locked' };

const isSecret = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_SECRET_LENGTH;

/** Changes the password. The API answers with a NEW token (the old one dies), so the cookie is replaced. A 403 never touches the cookie. */
export const POST = adminRoute({ mutating: true, auth: true }, async (ctx) => {
  const body = await readJsonObject(ctx.request, MAX_BODY_BYTES);
  if (body === null || !isSecret(body.currentPassword) || !isSecret(body.newPassword)) return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');

  const result = await adminChangePassword(
    { currentPassword: body.currentPassword, newPassword: body.newPassword },
    { token: ctx.token, requestId: ctx.requestId, clientIp: ctx.clientIp },
  );
  let response: NextResponse;
  let outcome: string;
  if (result.kind === 'ok') {
    response = NextResponse.json({ ok: true });
    if (applySession(response, result.data.accessToken, result.data.expiresAt)) outcome = 'ok';
    else {
      response = errorResponse(ctx, 502, 'ADMIN_UPSTREAM');
      outcome = 'unavailable';
    }
  } else {
    response = failure(ctx, result);
    outcome = (result.kind === 'problem' ? OUTCOMES[result.status] : undefined) ?? 'unavailable';
  }
  logEvent(outcome === 'ok' ? 'info' : 'warn', 'admin_password_change', { request_id: ctx.requestId, outcome, status: response.status });
  return response;
});

export const GET = notAllowed('POST');
export const PUT = notAllowed('POST');
export const PATCH = notAllowed('POST');
export const DELETE = notAllowed('POST');
export const OPTIONS = notAllowed('POST');
