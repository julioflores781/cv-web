import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { getResume } from '@/lib/api';
import { logEvent } from '@/lib/log';
import type { Resume } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { cacheKey, contentHash } from './cache-key';
import { CvDocument } from './cv-document';
import { registerPdfFonts } from './fonts';

export type PdfRenderer = (document: ReactElement<DocumentProps>) => Promise<Buffer>;

/** A rendered CV PDF and the hash of the content it was rendered from (its ETag). */
export interface CvPdf {
  buffer: Buffer;
  hash: string;
}

/** Most PDFs kept in memory: 2 languages x 2 versions of the content. */
export const MAX_CACHED_PDFS = 4;

// Least recently used first (Map keeps insertion order). Promises, so concurrent renders of the same content are shared.
const cache = new Map<string, Promise<Buffer>>();

async function render(resume: Resume, lang: Lang, renderer: PdfRenderer): Promise<Buffer> {
  registerPdfFonts();
  return renderer(CvDocument({ resume, labels: getDictionary(lang).pdf, education: getDictionary(lang).education, lang }));
}

function remember(key: string, lang: Lang, pending: Promise<Buffer>): void {
  cache.set(key, pending);
  while (cache.size > MAX_CACHED_PDFS) cache.delete(cache.keys().next().value as string);
  // A failed render is not kept: the next request tries again.
  pending.catch((error: unknown) => {
    if (cache.get(key) === pending) cache.delete(key);
    logEvent('warn', 'pdf_render_failed', { lang, error: error instanceof Error ? error : undefined });
  });
}

/**
 * The CV PDF of a language for the content the API returns right now. The API is asked on every call (a failure propagates, the
 * data source is not a PDF problem); rendered PDFs are kept in memory by content, so a PDF is never served for other data.
 * `null` (with a `pdf_render_failed` warning) if the render fails.
 */
export async function getCvPdf(lang: Lang, renderer: PdfRenderer = renderToBuffer): Promise<CvPdf | null> {
  const { resume } = await getResume(lang);
  const hash = contentHash(resume);
  const key = cacheKey(lang, hash);
  let pending = cache.get(key);
  if (pending) {
    cache.delete(key);
    cache.set(key, pending);
  } else {
    pending = render(resume, lang, renderer);
    remember(key, lang, pending);
  }
  try {
    return { buffer: await pending, hash };
  } catch {
    return null;
  }
}

/** Test helpers: size of the in-memory map and a way to empty it. */
export function cvPdfCacheSize(): number {
  return cache.size;
}

export function resetCvPdfMemo(): void {
  cache.clear();
}
