import path from 'node:path';
import { Font } from '@react-pdf/renderer';

/** Barlow Condensed (display) and IBM Plex Sans (text): static latin `.woff` straight from @fontsource (react-pdf has no woff2). */
export const PDF_FAMILIES = {
  head: 'Barlow Condensed',
  text: 'IBM Plex Sans',
} as const;

const fontsource = (pkg: string, file: string): string => path.join(process.cwd(), 'node_modules', '@fontsource', pkg, 'files', file);

export const PDF_FONT_FILES = {
  head700: fontsource('barlow-condensed', 'barlow-condensed-latin-700-normal.woff'),
  text400: fontsource('ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff'),
  text600: fontsource('ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff'),
} as const;

let registered = false;

/** Registers the faces once per process; no word hyphenation, so the extracted text stays clean for ATS parsers. */
export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({ family: PDF_FAMILIES.head, src: PDF_FONT_FILES.head700, fontWeight: 700 });
  Font.register({
    family: PDF_FAMILIES.text,
    fonts: [
      { src: PDF_FONT_FILES.text400, fontWeight: 400 },
      { src: PDF_FONT_FILES.text600, fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}
