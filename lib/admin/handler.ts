import { NextResponse, type NextRequest } from 'next/server';
import type { AdminProblem, AdminResult } from '@/lib/api/admin';
import { logEvent } from '@/lib/log';
import { newRequestId } from '@/lib/request-id';
import { hasJsonBody, hasMultipartBody, isSameOrigin } from './csrf';
import { clearSession, readToken } from './session';

export interface RouteContext {
  request: NextRequest;
  /** Ties the web's log lines, the API call and the answer's `X-Request-Id` together. */
  requestId: string;
  /** Raw `CF-Connecting-IP`, to be forwarded as `X-Client-IP` (the API validates it); never any other header. */
  clientIp: string | null;
  /** Token of the session cookie; `undefined` when absent or not shaped like one. */
  token: string | undefined;
}

export interface RouteOptions {
  /** Changes state: the Origin check and the body type are enforced before anything else. */
  mutating: boolean;
  /** Needs a session cookie; without one the answer is 401 and the API is not called. */
  auth: boolean;
  /** Body type of a mutation (default JSON). Only the upload takes multipart; `none` is a mutation without a body (a DELETE). */
  media?: 'json' | 'multipart' | 'none';
}

type Failure = Exclude<AdminResult<unknown>, { kind: 'ok' }>;

/** Codes of the API that may travel to the browser as they are; anything else would be a hole for arbitrary text. */
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

/** A JSON error: `{ code, requestId, retryAfterSeconds? }`. The browser turns the code into Spanish (`lib/admin/messages.ts`). */
export function errorResponse(ctx: RouteContext, status: number, code: string, retryAfterSeconds?: number): NextResponse {
  const response = NextResponse.json({ code, requestId: ctx.requestId, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) }, { status });
  if (retryAfterSeconds !== undefined) response.headers.set('Retry-After', String(retryAfterSeconds));
  return response;
}

function problemResponse(ctx: RouteContext, problem: AdminProblem): NextResponse {
  if (problem.status === 401) {
    // The API is the authority: the token is dead, so the cookie goes too.
    const response = errorResponse(ctx, 401, 'ADMIN_UNAUTHORIZED');
    clearSession(response);
    return response;
  }
  if (problem.status >= 500) return errorResponse(ctx, 502, 'ADMIN_UPSTREAM');
  return errorResponse(ctx, problem.status, SAFE_CODE.test(problem.code) ? problem.code : 'ADMIN_UPSTREAM', problem.retryAfterSeconds);
}

/** The answer for a failed call to the API. No URL, host nor detail of the API is ever included. */
export function failure(ctx: RouteContext, result: Failure): NextResponse {
  switch (result.kind) {
    case 'timeout':
      return errorResponse(ctx, 504, 'ADMIN_TIMEOUT');
    case 'problem':
      return problemResponse(ctx, result);
    case 'invalid':
      return result.source === 'input' ? errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST') : errorResponse(ctx, 502, 'ADMIN_UPSTREAM');
    default:
      return errorResponse(ctx, 502, 'ADMIN_UPSTREAM');
  }
}

export type BodyRead = { kind: 'ok'; bytes: Uint8Array<ArrayBuffer> } | { kind: 'too-large' };

/**
 * Reads the body up to `maxBytes`, counting while it streams: as soon as it goes over, the stream is cancelled and nothing more is read
 * (`too-large`). An absent body is an empty one.
 */
export async function readBody(request: Request, maxBytes: number): Promise<BodyRead> {
  if (!request.body) return { kind: 'ok', bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { kind: 'too-large' };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return { kind: 'ok', bytes };
}

export type JsonRead = { kind: 'ok'; value: Record<string, unknown> } | { kind: 'too-large' } | { kind: 'invalid' };

/** Reads a small JSON object, giving up as soon as the body goes over the limit (`too-large`); `invalid` when it is not a JSON object. */
export async function readJson(request: Request, maxBytes: number): Promise<JsonRead> {
  if (!request.body) return { kind: 'invalid' };
  const read = await readBody(request, maxBytes);
  if (read.kind === 'too-large') return read;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(read.bytes));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? { kind: 'ok', value: parsed as Record<string, unknown> } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

/** Reads a small JSON object; `null` for anything else (not JSON, an array, too big). */
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown> | null> {
  const read = await readJson(request, maxBytes);
  return read.kind === 'ok' ? read.value : null;
}

/** 405 for the methods a handler does not take. */
export const notAllowed =
  (allow: string) =>
  (): Response =>
    new Response(null, { status: 405, headers: { Allow: allow, 'Cache-Control': 'no-store' } });

function guard(options: RouteOptions, ctx: RouteContext): NextResponse | null {
  const { headers } = ctx.request;
  if (options.mutating) {
    if (!isSameOrigin(headers)) return errorResponse(ctx, 403, 'ADMIN_CSRF');
    const media = options.media ?? 'json';
    const allowed = media === 'none' || (media === 'multipart' ? hasMultipartBody(headers) : hasJsonBody(headers));
    if (!allowed) return errorResponse(ctx, 415, 'ADMIN_UNSUPPORTED_MEDIA');
  }
  if (options.auth && ctx.token === undefined) return errorResponse(ctx, 401, 'ADMIN_UNAUTHORIZED');
  return null;
}

/**
 * Wraps a route handler of the panel (and hands it the dynamic segments of its path): Origin and body type of mutations (403/415 with no call to the API), the session cookie, and on every
 * answer `Cache-Control: no-store` and `X-Request-Id`. An unexpected exception becomes a 500 `ADMIN_INTERNAL` with no trace.
 */
export function adminRoute<P = undefined>(
  options: RouteOptions,
  handler: (ctx: RouteContext, params: P | undefined) => Promise<Response> | Response,
): (request: NextRequest, segment?: { params: Promise<P> }) => Promise<Response> {
  return async (request, segment) => {
    const requestId = newRequestId();
    const ctx: RouteContext = { request, requestId, clientIp: request.headers.get('cf-connecting-ip'), token: readToken(request.cookies) };
    let response: Response;
    try {
      response = guard(options, ctx) ?? (await handler(ctx, segment === undefined ? undefined : await segment.params));
    } catch (error) {
      logEvent('error', 'admin_internal', { request_id: requestId, error });
      response = errorResponse(ctx, 500, 'ADMIN_INTERNAL');
    }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Request-Id', requestId);
    return response;
  };
}
