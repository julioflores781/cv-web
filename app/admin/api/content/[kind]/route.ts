import { NextResponse } from 'next/server';
import { getAdminContent, isContentKind, saveAdminContent, type AdminContent, type AdminResult, type ContentLang } from '@/lib/api/admin';
import { adminRoute, errorResponse, failure, notAllowed, readJson, type RouteContext } from '@/lib/admin/handler';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** A save is at most 96 KiB for the API; the web refuses anything over 128 KiB before calling it. */
const MAX_BODY_BYTES = 128 * 1024;
const MAX_ERRORS = 200;

type Params = { kind: string };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const apiContext = (ctx: RouteContext) => ({ token: ctx.token, requestId: ctx.requestId, clientIp: ctx.clientIp });

/** `GET /admin/api/content/{kind}/`: both languages, their versions and parity, as the API gives them. */
export const GET = adminRoute<Params>({ mutating: false, auth: true }, async (ctx, params) => {
  const kind = params?.kind;
  if (!isContentKind(kind)) return errorResponse(ctx, 404, 'ADMIN_NOT_FOUND');
  const result = await getAdminContent(kind, apiContext(ctx));
  return result.kind === 'ok' ? NextResponse.json(result.data) : failure(ctx, result);
});

const OUTCOMES: Record<number, string> = { 401: 'expired', 409: 'conflict', 413: 'too_large', 422: 'invalid' };

function outcomeOf(result: AdminResult<AdminContent>): string {
  if (result.kind === 'ok') return 'ok';
  if (result.kind === 'timeout') return 'timeout';
  if (result.kind === 'problem') return OUTCOMES[result.status] ?? (result.status >= 500 ? 'unavailable' : 'rejected');
  return result.kind === 'invalid' && result.source === 'input' ? 'rejected' : 'unavailable';
}

/**
 * `PUT /admin/api/content/{kind}/`: forwards ONLY `baseVersions`, `comment` and `documents`. A 409 carries the latest published content (read
 * right away; left out if that read fails) so the editor can show what changed without losing the draft; a 422 carries `errors` (path and code only).
 */
export const PUT = adminRoute<Params>({ mutating: true, auth: true }, async (ctx, params) => {
  const kind = params?.kind;
  if (!isContentKind(kind)) return errorResponse(ctx, 404, 'ADMIN_NOT_FOUND');
  const read = await readJson(ctx.request, MAX_BODY_BYTES);
  if (read.kind === 'too-large') return errorResponse(ctx, 413, 'CONTENT_TOO_LARGE');
  if (read.kind === 'invalid') return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');
  const { baseVersions, documents, comment } = read.value;
  if (
    !isObject(baseVersions) || !isVersion(baseVersions.es) || !isVersion(baseVersions.en) ||
    !isObject(documents) || !isObject(documents.es) || !isObject(documents.en) ||
    (comment !== undefined && comment !== null && typeof comment !== 'string')
  ) {
    return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');
  }

  const bases: Record<ContentLang, number> = { es: baseVersions.es, en: baseVersions.en };
  const result = await saveAdminContent(kind, { baseVersions: bases, comment: typeof comment === 'string' ? comment : undefined, documents: { es: documents.es, en: documents.en } }, apiContext(ctx));
  const outcome = outcomeOf(result);
  let response: NextResponse;
  let errorCount = 0;
  if (result.kind === 'ok') {
    response = NextResponse.json(result.data);
  } else if (result.kind === 'problem' && result.status === 409) {
    const latest = await getAdminContent(kind, apiContext(ctx));
    response = NextResponse.json({ code: 'CONTENT_VERSION_CONFLICT', requestId: ctx.requestId, ...(latest.kind === 'ok' ? { latest: latest.data } : {}) }, { status: 409 });
  } else if (result.kind === 'problem' && result.status === 422) {
    const errors = (result.errors ?? []).slice(0, MAX_ERRORS).map(({ path, code }) => ({ path, code }));
    errorCount = errors.length;
    const code = result.code === 'CONTENT_PARITY_BROKEN' ? 'CONTENT_PARITY_BROKEN' : 'CONTENT_INVALID';
    response = NextResponse.json({ code, requestId: ctx.requestId, errors }, { status: 422 });
  } else {
    response = failure(ctx, result);
  }
  logEvent(outcome === 'ok' ? 'info' : 'warn', 'admin_content_save', {
    request_id: ctx.requestId,
    kind,
    outcome,
    status: response.status,
    es_version: result.kind === 'ok' ? result.data.languages.es.version : bases.es,
    en_version: result.kind === 'ok' ? result.data.languages.en.version : bases.en,
    error_count: errorCount,
  });
  return response;
});

export const POST = notAllowed('GET, PUT');
export const PATCH = notAllowed('GET, PUT');
export const DELETE = notAllowed('GET, PUT');
export const OPTIONS = notAllowed('GET, PUT');
