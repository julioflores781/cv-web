import type { Lang } from '@/lib/i18n/config';

/** Published file names of the CV PDFs: the single source for the route, the download link and the tests. */
export const CV_PDF_FILES: Record<Lang, string> = {
  es: 'cv-julio-flores-es.pdf',
  en: 'cv-julio-flores-en.pdf',
};

/** Public URL path of the CV PDF in a language. */
export function cvPdfHref(lang: Lang): string {
  return `/${CV_PDF_FILES[lang]}`;
}
