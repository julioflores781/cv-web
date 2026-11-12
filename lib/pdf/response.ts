import type { Lang } from '@/lib/i18n/config';
import { getCvPdf } from './build-cv-pdf';
import { CV_PDF_FILES } from './files';

/** Whether an `If-None-Match` header matches the ETag (weak comparison, `*` and lists included). */
function matches(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((candidate) => {
    const value = candidate.trim();
    return value === '*' || value.replace(/^W\//, '') === etag;
  });
}

/**
 * Response of the PDF route handlers: the PDF (or a 304 if the client already has it), or a plain 404 when it could not be
 * rendered (the page then does not link it). `no-cache` + `ETag` keep shared caches from serving an old CV.
 */
export async function cvPdfResponse(lang: Lang, request: Request): Promise<Response> {
  const pdf = await getCvPdf(lang);
  if (!pdf) return new Response('CV PDF not available', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const etag = `"${pdf.hash}"`;
  const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (matches(request.headers.get('If-None-Match'), etag)) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(pdf.buffer), {
    headers: {
      ...headers,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${CV_PDF_FILES[lang]}"`,
    },
  });
}
