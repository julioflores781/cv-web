import { NextResponse } from 'next/server';
import { getAdminContent, isContentKind, isContentLang, rollbackContent, type AdminContent, type AdminResult } from '@/lib/api/admin';
import { adminRoute, errorResponse, failure, notAllowed, readJson, type RouteContext } from '@/lib/admin/handler';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** `{baseVersion, targetVersion}` fits in a few bytes; anything bigger is not a rollback. */
const MAX_BODY_BYTES = 4 * 1024;
const MAX_ERRORS = 200;
/** The API reads both numbers as a Java `int`. */
const INT_MAX = 2_147_483_647;

type Params = { kind: string; lang: string };

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= INT_MAX;

const apiContext = (ctx: RouteContext) => ({ token: ctx.token, requestId: ctx.requestId, clientIp: ctx.clientIp });

const OUTCOMES: Record<number, string> = { 401: 'expired', 404: 'not_found', 409: 'conflict', 422: 'invalid' };

function outcomeOf(result: AdminResult<AdminContent>): string {
  if (result.kind === 'ok') return 'ok';
  if (result.kind === 'timeout') return 'timeout';
  if (result.kind === 'problem') return OUTCOMES[result.status] ?? (result.status >= 500 ? 'unavailable' : 'rejected');
  return result.kind === 'invalid' && result.source === 'input' ? 'rejected' : 'unavailable';
}

/**
 * `POST /admin/api/content/{kind}/{lang}/rollback/` with `{baseVersion, targetVersion}`: reactivates an existing version of ONE language (the API
 * moves the pointer of the active version; it does not create a new one, so the history keeps everything). Only those two whole numbers (≥1) are
 * forwarded, once, never retried. A 409 (the active version is no longer `baseVersion`) carries the latest content, read right away, so the panel
 * can say which version is active now; a 422 (the target fails today's rules) carries `errors`; 404 `CONTENT_VERSION_NOT_FOUND` passes as is.
 */
export const POST = adminRoute<Params>({ mutating: true, auth: true }, async (ctx, params) => {
  const kind = params?.kind;
  const lang = params?.lang;
  if (!isContentKind(kind) || !isContentLang(lang)) return errorResponse(ctx, 404, 'ADMIN_NOT_FOUND');
  const read = await readJson(ctx.request, MAX_BODY_BYTES);
  if (read.kind === 'too-large') return errorResponse(ctx, 413, 'ADMIN_BAD_REQUEST');
  if (read.kind === 'invalid') return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');
  const { baseVersion, targetVersion } = read.value;
  if (!isVersion(baseVersion) || !isVersion(targetVersion)) return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');

  const result = await rollbackContent(kind, lang, { baseVersion, targetVersion }, apiContext(ctx));
  let response: NextResponse;
  if (result.kind === 'ok') {
    response = NextResponse.json(result.data);
  } else if (result.kind === 'problem' && result.status === 409) {
    const latest = await getAdminContent(kind, apiContext(ctx));
    response = NextResponse.json({ code: 'CONTENT_VERSION_CONFLICT', requestId: ctx.requestId, ...(latest.kind === 'ok' ? { latest: latest.data } : {}) }, { status: 409 });
  } else if (result.kind === 'problem' && result.status === 422) {
    const errors = (result.errors ?? []).slice(0, MAX_ERRORS).map(({ path, code }) => ({ path, code }));
    response = NextResponse.json({ code: 'CONTENT_INVALID', requestId: ctx.requestId, errors }, { status: 422 });
  } else {
    response = failure(ctx, result);
  }
  const outcome = outcomeOf(result);
  // Versions only: never the comment, the content nor anything of the request.
  logEvent(outcome === 'ok' ? 'info' : 'warn', 'admin_rollback', {
    request_id: ctx.requestId,
    kind,
    lang,
    outcome,
    from: baseVersion,
    to: result.kind === 'ok' ? result.data.languages[lang].version : targetVersion,
  });
  return response;
});

export const GET = notAllowed('POST');
export const PUT = notAllowed('POST');
export const PATCH = notAllowed('POST');
export const DELETE = notAllowed('POST');
export const OPTIONS = notAllowed('POST');
