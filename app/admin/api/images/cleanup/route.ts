import { NextResponse } from 'next/server';
import { cleanupImages } from '@/lib/api/admin';
import { adminRoute, errorResponse, notAllowed, readJson } from '@/lib/admin/handler';
import { imageCallContext, imageFailure, imageOutcome } from '@/lib/admin/image-handler';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 4 * 1024;
const DEFAULT_HOURS = 24;
/** A year: anything above is a typo, not a grace period. */
const MAX_HOURS = 24 * 365;

/**
 * `POST /admin/api/images/cleanup/` with `{dryRun?, olderThanHours?}`: `dryRun` defaults to `true` (a simulation) and `olderThanHours` to 24,
 * a whole number of at least 1 (0 is refused here; it never reaches the API). Turned into the query of `POST /images/cleanup`.
 */
export const POST = adminRoute({ mutating: true, auth: true }, async (ctx) => {
  const read = await readJson(ctx.request, MAX_BODY_BYTES);
  if (read.kind === 'too-large') return errorResponse(ctx, 413, 'ADMIN_BAD_REQUEST');
  if (read.kind === 'invalid') return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');
  const { dryRun = true, olderThanHours = DEFAULT_HOURS } = read.value;
  if (typeof dryRun !== 'boolean' || typeof olderThanHours !== 'number' || !Number.isInteger(olderThanHours) || olderThanHours < 1 || olderThanHours > MAX_HOURS) {
    return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');
  }
  const result = await cleanupImages({ dryRun, olderThanHours }, imageCallContext(ctx));
  const response = result.kind === 'ok' ? NextResponse.json(result.data) : imageFailure(ctx, result);
  logEvent(result.kind === 'ok' ? 'info' : 'warn', 'admin_image_cleanup', {
    request_id: ctx.requestId,
    outcome: result.kind === 'ok' ? 'ok' : imageOutcome(result),
    status: response.status,
    dry_run: dryRun,
    ...(result.kind === 'ok' ? { count: dryRun ? result.data.wouldDelete.length : result.data.deleted.length } : {}),
  });
  return response;
});

export const GET = notAllowed('POST');
export const PUT = notAllowed('POST');
export const PATCH = notAllowed('POST');
export const DELETE = notAllowed('POST');
export const OPTIONS = notAllowed('POST');
