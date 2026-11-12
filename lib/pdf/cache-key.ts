import { createHash } from 'node:crypto';
import type { Lang } from '@/lib/i18n/config';

/** JSON with object keys sorted at every level, so equal content always serializes equally. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** sha256 (hex) of the resume content, independent of key order: the PDF's ETag. */
export function contentHash(resume: unknown): string {
  return createHash('sha256').update(stableStringify(resume)).digest('hex');
}

/** Cache key of a rendered PDF: language plus the content hash (see `contentHash`). */
export function cacheKey(lang: Lang, hash: string): string {
  return `${lang}:${hash}`;
}
