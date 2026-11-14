import { randomUUID } from 'node:crypto';
import { adminRequest, UPLOAD_TIMEOUT_MS } from './client';
import { ADMIN_BASE, rejectedInput } from './ops';
import { parseCleanupReport, parseEmpty, parseStoredImages, parseUploadedImage } from './parse';
import type { AdminCallContext, AdminResult, CleanupInput, CleanupReport, StoredImage, UploadedImage } from './types';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const IMAGES = `${ADMIN_BASE}/images`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Builds a fresh `multipart/form-data` body with one `file` part (fixed file name `upload`, own boundary). The browser's multipart is never
 * forwarded: the caller has already checked these bytes, and only those bytes travel.
 */
export function buildUploadBody(bytes: Uint8Array): { body: Uint8Array; contentType: string } {
  const boundary = `----cvweb${randomUUID().replaceAll('-', '')}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload"\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, bytes, tail]), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** `POST /images`. Empty or over-5 MiB input is refused before sending. 400/413/415/503 (`IMAGE_*`) come back as problems. Never retried. */
export function uploadImage(bytes: Uint8Array, ctx: AdminCallContext): Promise<AdminResult<UploadedImage>> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) return Promise.resolve(rejectedInput(ctx));
  const { body, contentType } = buildUploadBody(bytes);
  return adminRequest({
    ...ctx,
    operation: 'images.upload',
    method: 'POST',
    path: IMAGES,
    binary: { bytes: body, contentType },
    parse: parseUploadedImage,
    success: [201],
    timeoutMs: ctx.timeoutMs ?? UPLOAD_TIMEOUT_MS,
  });
}

/** `GET /images`: everything under `site/projects/`, each with whether any version uses it. */
export function listImages(ctx: AdminCallContext): Promise<AdminResult<StoredImage[]>> {
  return adminRequest({ ...ctx, operation: 'images.list', method: 'GET', path: IMAGES, parse: parseStoredImages });
}

/** `DELETE /images/{id}`: `id` is the UUID of the key. 404 `IMAGE_NOT_FOUND`, 409 `IMAGE_IN_USE`. */
export function deleteImage(id: string, ctx: AdminCallContext): Promise<AdminResult<true>> {
  if (!UUID.test(id)) return Promise.resolve(rejectedInput(ctx));
  return adminRequest({ ...ctx, operation: 'images.delete', method: 'DELETE', path: `${IMAGES}/${id}`, parse: parseEmpty, success: [204] });
}

/** `POST /images/cleanup?dryRun=&olderThanHours=`: `olderThanHours` is a whole number of at least 1. */
export function cleanupImages(input: CleanupInput, ctx: AdminCallContext): Promise<AdminResult<CleanupReport>> {
  if (typeof input.dryRun !== 'boolean' || !Number.isInteger(input.olderThanHours) || input.olderThanHours < 1) return Promise.resolve(rejectedInput(ctx));
  return adminRequest({
    ...ctx,
    operation: 'images.cleanup',
    method: 'POST',
    path: `${IMAGES}/cleanup`,
    query: { dryRun: input.dryRun, olderThanHours: input.olderThanHours },
    parse: parseCleanupReport,
  });
}
