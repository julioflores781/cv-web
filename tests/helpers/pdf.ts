import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfInfo {
  pages: string[];
  text: string;
  title: string;
  author: string;
  creator: string;
  language: string;
  /** Link annotation targets. */
  links: string[];
}

/** Extracts per-page text, metadata and link targets from a PDF buffer (tests only). */
export async function readPdf(buffer: Uint8Array): Promise<PdfInfo> {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const pages: string[] = [];
  const links: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''));
    for (const annotation of await page.getAnnotations()) if (typeof annotation.url === 'string') links.push(annotation.url);
  }
  const meta = (await doc.getMetadata()) as { info: Record<string, unknown> };
  const info = meta.info;
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  await task.destroy();
  return { pages, text: pages.join('\n'), title: text(info.Title), author: text(info.Author), creator: text(info.Creator), language: text(info.Language), links };
}

/** Names of the embedded fonts, read from the raw PDF (`/BaseFont /ABCDEF+Name`). */
export function fontNames(buffer: Uint8Array): string[] {
  const raw = Buffer.from(buffer).toString('latin1');
  return [...new Set([...raw.matchAll(/\/BaseFont\s*\/(?:[A-Z]{6}\+)?([A-Za-z0-9-]+)/g)].map((match) => match[1] as string))];
}
