// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEs } from '@/tests/fixtures/resume';
import { ROOT } from '@/tests/helpers/css';
import { fontNames } from '@/tests/helpers/pdf';
import { CvDocument } from './cv-document';
import { PDF_FONT_FILES, registerPdfFonts } from './fonts';

function findWoff(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'out') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findWoff(full);
    return entry.name.endsWith('.woff') ? [full] : [];
  });
}

describe('PDF fonts', () => {
  it('PD-T11: the font paths are the .woff files of @fontsource in node_modules, and the repo holds no .woff copy', () => {
    for (const file of Object.values(PDF_FONT_FILES)) {
      expect(file, file).toMatch(/node_modules\/@fontsource\/[^/]+\/files\/[^/]+\.woff$/);
      expect(existsSync(file), file).toBe(true);
    }
    expect(findWoff(ROOT)).toEqual([]);
  });

  it('PD-T12: the generated PDF embeds only Barlow Condensed Bold and IBM Plex Sans (no IBM Plex Mono)', async () => {
    registerPdfFonts();
    const dict = getDictionary('es');
    const buffer = await renderToBuffer(CvDocument({ resume: resumeEs, labels: dict.pdf, education: dict.education, lang: 'es' }));
    const names = fontNames(buffer).join(' ');
    expect(names).toMatch(/BarlowCondensed-Bold/);
    expect(names).toMatch(/IBMPlexSans/);
    expect(names).not.toMatch(/Mono/);
    expect(Object.keys(PDF_FONT_FILES).sort()).toEqual(['head700', 'text400', 'text600']);
  });
});
