import type { CleanupReport, UploadedImage } from '@/lib/api/admin';

/**
 * Image checks shared by the browser (before uploading) and the upload handler (before forwarding). Like the API (`ImageFormat.detect`), the
 * format comes only from the first 12 bytes: the file name and the type the browser declares never count. No `node:` import: browser-safe.
 */

/** 5 MiB, the API's own limit (`UploadProjectImageService.MAX_BYTES`). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** The longest signature (WebP: `RIFF....WEBP`) is 12 bytes; the API needs 12 too. */
export const IMAGE_HEAD_BYTES = 12;
/** What the file picker offers (a hint only: the bytes decide). */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

export type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
export type ImageCheck = { ok: true; type: ImageType } | { ok: false; reason: 'empty' | 'too-large' | 'type' };

const startsWith = (head: Uint8Array, signature: ReadonlyArray<number | string>, at = 0): boolean => {
  const expected = signature.flatMap((part) => (typeof part === 'number' ? [part] : [...part].map((char) => char.charCodeAt(0))));
  return expected.every((byte, i) => head[at + i] === byte);
};

/** The format of these bytes, or `null` when they are not a JPEG, PNG, GIF or WebP (or fewer than 12 bytes). */
export function sniffImage(head: Uint8Array): ImageType | null {
  if (head.byteLength < IMAGE_HEAD_BYTES) return null;
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(head, [0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, ['GIF87a']) || startsWith(head, ['GIF89a'])) return 'image/gif';
  if (startsWith(head, ['RIFF']) && startsWith(head, ['WEBP'], 8)) return 'image/webp';
  return null;
}

/** The size decides first (nothing to read for an empty or oversized file), then the first bytes. */
export function checkImageBytes(head: Uint8Array, size: number): ImageCheck {
  if (size === 0) return { ok: false, reason: 'empty' };
  if (size > MAX_IMAGE_BYTES) return { ok: false, reason: 'too-large' };
  const type = sniffImage(head.subarray(0, IMAGE_HEAD_BYTES));
  return type === null ? { ok: false, reason: 'type' } : { ok: true, type };
}

const UNSUPPORTED_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis']);

/**
 * Whether bytes that are not an accepted format are another known image type (SVG, HEIC/AVIF, BMP, TIFF, ICO): the API answers those with 415
 * `IMAGE_UNSUPPORTED_TYPE` and anything else with 400 `IMAGE_INVALID` (`ImageFormat.isKnownUnsupported`). Looks at up to 1024 bytes.
 */
export function isKnownUnsupported(content: Uint8Array): boolean {
  if (content.byteLength < 4) return false;
  if (startsWith(content, ['BM']) || startsWith(content, ['II', 0x2a, 0x00]) || startsWith(content, ['MM', 0x00, 0x2a]) || startsWith(content, [0x00, 0x00, 0x01, 0x00])) return true;
  if (content.byteLength >= 12 && startsWith(content, ['ftyp'], 4)) {
    const brand = String.fromCharCode(...content.subarray(8, 12)).toLowerCase();
    if (UNSUPPORTED_BRANDS.has(brand)) return true;
  }
  return new TextDecoder().decode(content.subarray(0, 1024)).toLowerCase().includes('<svg');
}

/** Checks a file chosen in the browser reading only its first 12 bytes. */
export async function checkImageFile(file: Blob): Promise<ImageCheck> {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return checkImageBytes(new Uint8Array(0), file.size);
  const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
  return checkImageBytes(head, file.size);
}

const KEY = /^site\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|gif)$/;

/** The id of `DELETE /images/{id}`: the lowercase UUID of a well-formed key; `null` otherwise. */
export const imageIdOf = (key: string): string | null => KEY.exec(key)?.[1] ?? null;

/** Short, readable form of a storage key (`site/projects/<uuid>.webp` -> `<first 8>….webp`). */
export function shortKey(key: string): string {
  const name = key.split('/').pop() ?? key;
  const dot = name.lastIndexOf('.');
  return dot > 8 ? `${name.slice(0, 8)}…${name.slice(dot)}` : name;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isSide = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/** The answer of the upload handler, as the browser receives it; `null` when it is not that shape (the key must be a well-formed key). */
export function parseUploaded(value: unknown): UploadedImage | null {
  if (!isRecord(value)) return null;
  const { key, url, contentType, bytes, width, height } = value;
  if (typeof key !== 'string' || imageIdOf(key) === null || typeof url !== 'string' || typeof contentType !== 'string') return null;
  if (typeof bytes !== 'number' || !isSide(width) || !isSide(height)) return null;
  return { key, url, contentType, bytes, width, height };
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The answer of the cleanup handler; `null` when it is not that shape. */
export function parseCleanup(value: unknown): CleanupReport | null {
  if (!isRecord(value)) return null;
  const { dryRun, deleted, wouldDelete, kept } = value;
  if (typeof dryRun !== 'boolean' || !isStrings(deleted) || !isStrings(wouldDelete) || typeof kept !== 'number') return null;
  return { dryRun, deleted, wouldDelete, kept };
}

/**
 * What the projects editor knows of the storage: the stored images (key and public URL, from `GET /admin/images`), or that the storage could
 * not be read (then there are no thumbnails, and nothing is flagged as missing). The stored project only has keys: URLs come from here.
 */
export type ImageLibrary = { kind: 'ok'; images: ReadonlyArray<{ key: string; url: string }> } | { kind: 'unavailable'; reference?: string | undefined };

/**
 * An image uploaded in this visit: its public URL and a local preview (an object URL, revoked on leaving). When the preview fails it is
 * revoked at once and the row shows its text instead (`failed`).
 */
export interface UploadedPreview {
  url: string;
  preview?: string | undefined;
  failed?: boolean;
}
