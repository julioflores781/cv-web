// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseResume } from '@/lib/api/validate';
import type { Resume } from '@/lib/api/types';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEs } from '@/tests/fixtures/resume';
import { SENTINELS, dirtyResume } from '@/tests/helpers/fake-api';
import { readPdf } from '@/tests/helpers/pdf';
import { CvDocument } from './cv-document';
import { registerPdfFonts } from './fonts';

async function render(resume: Resume) {
  const dict = getDictionary('es');
  const buffer = await renderToBuffer(CvDocument({ resume, labels: dict.pdf, education: dict.education, lang: 'es' }));
  return { buffer, info: await readPdf(buffer) };
}

beforeAll(() => registerPdfFonts());

describe('CV PDF privacy', () => {
  it('PD-T8: private values injected before the parser never reach the PDF text or metadata', async () => {
    const parsed = parseResume(dirtyResume('es'));
    expect(parsed).not.toBeNull();
    const { buffer, info } = await render(parsed as Resume);
    const haystack = [info.text, info.title, info.author, info.creator, buffer.toString('latin1')].join('\n');
    for (const value of Object.values(SENTINELS)) expect(haystack).not.toContain(value);
  });

  it('PD-T9: only email, LinkedIn and GitHub are printed and linked; Twitter and javascript: URLs are dropped', async () => {
    const resume: Resume = {
      ...resumeEs,
      contact: {
        email: 'ada@example.test',
        profiles: [
          { network: 'LinkedIn', url: 'https://www.linkedin.com/in/ada-ejemplo' },
          { network: 'GitHub', url: 'https://github.com/ada-ejemplo' },
          { network: 'Twitter', url: 'https://twitter.com/ada-ejemplo' },
          { network: 'LinkedIn', url: 'javascript:alert(1)' },
        ],
      },
    };
    const { info } = await render(resume);
    expect(info.text).toContain('ada@example.test');
    expect(info.text).toContain('www.linkedin.com/in/ada-ejemplo');
    expect(info.text).toContain('github.com/ada-ejemplo');
    expect(info.text).not.toMatch(/twitter|javascript/i);
    expect(info.links).toEqual(['mailto:ada@example.test', 'https://www.linkedin.com/in/ada-ejemplo', 'https://github.com/ada-ejemplo']);
  });

  it('PD-T10: metadata has the title, author and language, and no creator with a local path', async () => {
    const { info } = await render(resumeEs);
    expect(info.title).toBe('Ada Ejemplo — CV');
    expect(info.author).toBe('Ada Ejemplo');
    expect(info.language).toBe('es');
    expect(info.creator).not.toMatch(/[\\/]|Users|node_modules/);
  });
});
