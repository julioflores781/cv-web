// @vitest-environment node
import { renderToBuffer } from '@react-pdf/renderer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Resume } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { fixtureFor, manyJobsResume, minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { readPdf, type PdfInfo } from '@/tests/helpers/pdf';
import { CvDocument } from './cv-document';
import { registerPdfFonts } from './fonts';

async function render(resume: Resume, lang: Lang = resume.language as Lang): Promise<{ buffer: Buffer; info: PdfInfo }> {
  const dict = getDictionary(lang);
  const buffer = await renderToBuffer(CvDocument({ resume, labels: dict.pdf, education: dict.education, lang }));
  return { buffer, info: await readPdf(buffer) };
}

beforeAll(() => registerPdfFonts());

describe('CvDocument', () => {
  it('PD-T1: the ES PDF is a real PDF with the name, label, summary and the 3 jobs as text', async () => {
    const { buffer, info } = await render(resumeEs);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(info.pages.length).toBeGreaterThanOrEqual(1);
    for (const expected of ['ADA EJEMPLO', resumeEs.profile.label, resumeEs.profile.summary as string]) expect(info.text).toContain(expected);
    for (const job of resumeEs.experience) expect(info.text).toContain(job.position);
    expect(info.language).toBe('es');
  });

  it('PD-T2: the EN PDF has English headings and the EN fixture text', async () => {
    const { info } = await render(resumeEn);
    const labels = getDictionary('en').pdf;
    for (const heading of [labels.summary, labels.experience, labels.skills, labels.education, labels.languages]) expect(info.text).toContain(heading);
    expect(info.text).toContain(resumeEn.profile.summary as string);
    expect(info.text).not.toContain(getDictionary('es').pdf.experience);
    expect(info.language).toBe('en');
  });

  it('PD-T3: highlights and phases are bullets under their job, and the section order is header, summary, experience, skills, education, languages', async () => {
    const { info } = await render(resumeEs);
    expect(info.text).toMatch(/•\s*Fase uno — Cliente Ejemplo/);
    expect(info.text).toMatch(/•\s*Logro ficticio/);
    const labels = getDictionary('es').pdf;
    const at = [info.text.indexOf('ADA EJEMPLO'), ...[labels.summary, labels.experience, labels.skills, labels.education, labels.languages].map((h) => info.text.indexOf(h))];
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(info.text.indexOf('Fase uno')).toBeGreaterThan(info.text.indexOf('Desarrolladora de ejemplo'));
    expect(info.text.indexOf('Fase uno')).toBeLessThan(info.text.indexOf('Analista de ejemplo'));
  });

  it('PD-T4: empty education, skills, languages and impact leave no section or empty heading', async () => {
    const resume: Resume = { ...resumeEs, education: { education: [], certificates: [], courses: [] }, skills: [], languages: [], impact: [] };
    const { info } = await render(resume);
    const labels = getDictionary('es').pdf;
    for (const heading of [labels.skills, labels.education, labels.languages]) expect(info.text).not.toContain(heading);
    expect(info.text).toContain(labels.experience);
  });

  it('PD-T5: missing summary, city and tagline leave no «undefined», «null» nor empty lines', async () => {
    const { info } = await render(minimalResume());
    expect(info.text).not.toMatch(/undefined|null/);
    expect(info.text).not.toContain(getDictionary('es').pdf.summary);
    expect(info.text).not.toMatch(/\n\s*\n\s*\n/);
  });

  it('PD-T6: many jobs flow onto more than one page and no job is split across pages', async () => {
    const resume = manyJobsResume(14);
    const { info } = await render(resume);
    expect(info.pages.length).toBeGreaterThan(1);
    for (const job of resume.experience) {
      const holders = info.pages.filter((page) => new RegExp(`${job.position}(?!\\d)`).test(page));
      expect(holders, job.position).toHaveLength(1);
      expect(holders[0]).toContain(job.highlights.at(-1) as string);
    }
  });

  it('PD-T7: the text reads linearly, header before experience before education', async () => {
    const { info } = await render(fixtureFor('es'));
    const order = ['ADA EJEMPLO', 'ada@example.test', 'Acme Ejemplo', 'Initech Ejemplo', 'Lenguaje Uno', 'Universidad Ejemplo', 'Nativo'].map((needle) => info.text.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('PD-T28: every page of the real PDF prints its own «n/total» page number', async () => {
    const { info } = await render(manyJobsResume(14));
    const total = info.pages.length;
    expect(total).toBeGreaterThan(1);
    info.pages.forEach((page, index) => expect(page, `page ${index + 1}`).toMatch(new RegExp(`(^|\\s)${index + 1}/${total}(\\s|$)`)));
    const one = await render(minimalResume());
    expect(one.info.pages).toHaveLength(1);
    expect(one.info.text).toMatch(/(^|\s)1\/1(\s|$)/);
  });
});
