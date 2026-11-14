import { NextResponse } from 'next/server';
import { deleteImage } from '@/lib/api/admin';
import { adminRoute, errorResponse, notAllowed } from '@/lib/admin/handler';
import { imageCallContext, imageFailure, imageOutcome } from '@/lib/admin/image-handler';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

type Params = { id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * `DELETE /admin/api/images/{id}/`: `id` is the lowercase UUID of the key; anything else is a 400 here, without asking the API. The API's 204
 * becomes a 200 `{ok:true}`; 404 `IMAGE_NOT_FOUND`, 409 `IMAGE_IN_USE` (some version, maybe an old one, uses it) and 503 pass with their code.
 */
export const DELETE = adminRoute<Params>({ mutating: true, auth: true, media: 'none' }, async (ctx, params) => {
  const id = params?.id ?? '';
  if (!UUID.test(id)) {
    logEvent('warn', 'admin_image_delete', { request_id: ctx.requestId, outcome: 'rejected', status: 400 });
    return errorResponse(ctx, 400, 'ADMIN_BAD_REQUEST');
  }
  const result = await deleteImage(id, imageCallContext(ctx));
  const response = result.kind === 'ok' ? NextResponse.json({ ok: true }) : imageFailure(ctx, result);
  logEvent(result.kind === 'ok' ? 'info' : 'warn', 'admin_image_delete', {
    request_id: ctx.requestId,
    outcome: result.kind === 'ok' ? 'ok' : imageOutcome(result),
    status: response.status,
  });
  return response;
});

export const GET = notAllowed('DELETE');
export const POST = notAllowed('DELETE');
export const PUT = notAllowed('DELETE');
export const PATCH = notAllowed('DELETE');
export const OPTIONS = notAllowed('DELETE');
