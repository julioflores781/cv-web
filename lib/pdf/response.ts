import type { Lang } from '@/lib/i18n/config';
import { getCvPdf } from './build-cv-pdf';

/** Response of the PDF route handlers: the PDF, or a plain 404 when it could not be rendered (the page then does not link it). */
export async function cvPdfResponse(lang: Lang): Promise<Response> {
  const pdf = await getCvPdf(lang);
  if (!pdf) return new Response('CV PDF not available', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } });
}
