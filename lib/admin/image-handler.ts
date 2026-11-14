import type { NextResponse } from 'next/server';
import type { AdminCallContext, AdminResult } from '@/lib/api/admin';
import { errorResponse, failure, type RouteContext } from './handler';
import { MAX_IMAGE_BYTES } from './images';

/**
 * Cap of the whole multipart body: the 5 MiB file plus room for the framing. The handler enforces it itself, by `Content-Length` before
 * reading and by counting while reading: with `proxy.ts`, Next buffers request bodies up to 10 MB and silently truncates beyond, so the size
 * of what arrives cannot be trusted on its own (`proxyClientMaxBodySize` is left alone on purpose).
 */
export const MAX_UPLOAD_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

type Failure = Exclude<AdminResult<unknown>, { kind: 'ok' }>;

/** What the image calls need from the route: token, request id and the visitor IP (never any other header). */
export const imageCallContext = (ctx: RouteContext): AdminCallContext => ({ token: ctx.token, requestId: ctx.requestId, clientIp: ctx.clientIp });

/**
 * A failed image call. The storage being down is a 503 `IMAGE_STORAGE_UNAVAILABLE` that reaches the browser as it is (the panel says so and
 * keeps the rest working); every other failure follows the common mapping (`failure`).
 */
export function imageFailure(ctx: RouteContext, result: Failure): NextResponse {
  if (result.kind === 'problem' && result.status === 503 && result.code === 'IMAGE_STORAGE_UNAVAILABLE') return errorResponse(ctx, 503, result.code);
  return failure(ctx, result);
}

/** Outcome of a failed image call for the logs: a word, never a detail of the API. */
export function imageOutcome(result: Failure): string {
  if (result.kind === 'timeout') return 'timeout';
  if (result.kind === 'invalid') return result.source === 'input' ? 'rejected' : 'unavailable';
  if (result.kind !== 'problem') return 'unavailable';
  if (result.status === 401) return 'expired';
  if (result.status === 503 || result.status >= 500) return 'unavailable';
  if (result.status === 404) return 'not_found';
  if (result.status === 409) return 'in_use';
  if (result.status === 413) return 'too_large';
  if (result.status === 415) return 'unsupported';
  return 'rejected';
}
