import { NextResponse } from 'next/server';
import { listImages, uploadImage } from '@/lib/api/admin';
import { adminRoute, errorResponse, notAllowed, readBody, type RouteContext } from '@/lib/admin/handler';
import { imageCallContext, imageFailure, imageOutcome, MAX_UPLOAD_BODY_BYTES } from '@/lib/admin/image-handler';
import { checkImageBytes, isKnownUnsupported, MAX_IMAGE_BYTES } from '@/lib/admin/images';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** `GET /admin/api/images/`: every stored image with whether any version uses it. A storage that is down is a 503 the page explains. */
export const GET = adminRoute({ mutating: false, auth: true }, async (ctx) => {
  const result = await listImages(imageCallContext(ctx));
  return result.kind === 'ok' ? NextResponse.json({ images: result.data }) : imageFailure(ctx, result);
});

function logUpload(ctx: RouteContext, status: number, outcome: string, bytes?: number, contentType?: string): void {
  // Never the file name, its bytes or anything the browser declared: only what the web measured.
  logEvent(outcome === 'ok' ? 'info' : 'warn', 'admin_image_upload', {
    request_id: ctx.requestId,
    outcome,
    status,
    ...(bytes === undefined ? {} : { bytes }),
    ...(contentType === undefined ? {} : { content_type: contentType }),
  });
}

function refuse(ctx: RouteContext, status: number, code: string, outcome: string, bytes?: number): NextResponse {
  logUpload(ctx, status, outcome, bytes);
  return errorResponse(ctx, status, code);
}

/** The single `file` part of a multipart body, or `null` when the body is not exactly that. */
async function singleFile(bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<File | null> {
  let form: FormData;
  try {
    form = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    return null;
  }
  const entries = [...form.entries()];
  if (entries.length !== 1) return null;
  const [name, value] = entries[0] ?? [];
  return name === 'file' && value instanceof File ? value : null;
}

/**
 * `POST /admin/api/images/` (multipart, one `file` part). Checked here before the API sees anything: the body cap (413 without reading when
 * `Content-Length` says so; counted while reading otherwise), exactly one non-empty `file` part (400), at most 5 MiB (413) and the magic bytes
 * (415 for another image type, 400 for anything else). Only the validated bytes travel, in a fresh multipart built by `uploadImage`. Never retried.
 */
export const POST = adminRoute({ mutating: true, auth: true, media: 'multipart' }, async (ctx) => {
  const declared = ctx.request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_UPLOAD_BODY_BYTES)) {
    return /^\d+$/.test(declared) ? refuse(ctx, 413, 'IMAGE_TOO_LARGE', 'too_large') : refuse(ctx, 400, 'IMAGE_INVALID', 'invalid');
  }
  const read = await readBody(ctx.request, MAX_UPLOAD_BODY_BYTES);
  if (read.kind === 'too-large') return refuse(ctx, 413, 'IMAGE_TOO_LARGE', 'too_large');

  const file = await singleFile(read.bytes, ctx.request.headers.get('content-type') ?? '');
  if (file === null || file.size === 0) return refuse(ctx, 400, 'IMAGE_INVALID', 'invalid');
  if (file.size > MAX_IMAGE_BYTES) return refuse(ctx, 413, 'IMAGE_TOO_LARGE', 'too_large', file.size);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkImageBytes(bytes, bytes.byteLength);
  if (!check.ok) {
    // Same split as the API: another known image type (SVG, HEIC…) is 415, bytes that are no image at all are 400.
    return isKnownUnsupported(bytes) ? refuse(ctx, 415, 'IMAGE_UNSUPPORTED_TYPE', 'unsupported', bytes.byteLength) : refuse(ctx, 400, 'IMAGE_INVALID', 'invalid', bytes.byteLength);
  }

  const result = await uploadImage(bytes, imageCallContext(ctx));
  if (result.kind === 'ok') {
    const { key, url, contentType, bytes: size, width, height } = result.data;
    logUpload(ctx, 201, 'ok', size, contentType);
    return NextResponse.json({ key, url, contentType, bytes: size, width, height }, { status: 201 });
  }
  const response = imageFailure(ctx, result);
  logUpload(ctx, response.status, imageOutcome(result), bytes.byteLength);
  return response;
});

export const PUT = notAllowed('GET, POST');
export const PATCH = notAllowed('GET, POST');
export const DELETE = notAllowed('GET, POST');
export const OPTIONS = notAllowed('GET, POST');
