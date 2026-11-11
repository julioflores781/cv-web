import { renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { getResume } from '@/lib/api';
import type { Lang } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { CvDocument } from './cv-document';
import { registerPdfFonts } from './fonts';

export type PdfRenderer = (document: ReactElement<DocumentProps>) => Promise<Buffer>;

const memo = new Map<Lang, Promise<Buffer | null>>();

async function build(lang: Lang, render: PdfRenderer): Promise<Buffer | null> {
  // A missing data source is not a PDF problem: it propagates and fails the build like the pages do.
  const { resume } = await getResume(lang);
  try {
    registerPdfFonts();
    return await render(CvDocument({ resume, labels: getDictionary(lang).pdf, education: getDictionary(lang).education, lang }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[cv-web] PDF (${lang}) failed: ${reason}; download button omitted`);
    return null;
  }
}

/** The CV PDF of a language, rendered once per process; `null` (with a warning) if the render fails, so the web still builds. */
export function getCvPdf(lang: Lang, render: PdfRenderer = renderToBuffer): Promise<Buffer | null> {
  let pending = memo.get(lang);
  if (!pending) {
    pending = build(lang, render);
    memo.set(lang, pending);
  }
  return pending;
}

/** Test helper: forgets memoized PDFs. */
export function resetCvPdfMemo(): void {
  memo.clear();
}
