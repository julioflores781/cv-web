// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeEs } from '@/tests/fixtures/resume';
import { getCvPdf, resetCvPdfMemo, type PdfRenderer } from './build-cv-pdf';
import { cvPdfResponse } from './response';

const getResume = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ getResume }));

const PDF = Buffer.from('%PDF-1.7 fake');

beforeEach(() => {
  resetCvPdfMemo();
  getResume.mockReset();
  getResume.mockResolvedValue({ resume: resumeEs, source: 'api' });
});

afterEach(() => vi.restoreAllMocks());

describe('getCvPdf', () => {
  it('PD-T14: a renderer that throws gives null, one warning with language and reason, and no exception', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const render: PdfRenderer = () => Promise.reject(new Error('boom'));
    await expect(getCvPdf('es', render)).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/PDF \(es\).*boom/);
  });

  it('PD-T15: a working renderer runs once per language, however many calls', async () => {
    const render = vi.fn<PdfRenderer>().mockResolvedValue(PDF);
    const [a, b] = await Promise.all([getCvPdf('es', render), getCvPdf('es', render)]);
    expect(a).toBe(PDF);
    expect(b).toBe(PDF);
    await getCvPdf('es', render);
    expect(render).toHaveBeenCalledTimes(1);
    await getCvPdf('en', render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('PD-T16: when getResume fails without a fallback, getCvPdf propagates the error (the data source is missing)', async () => {
    getResume.mockRejectedValue(new Error('Resume (es) unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(getCvPdf('es', vi.fn<PdfRenderer>())).rejects.toThrow(/unavailable/);
    expect(warn).not.toHaveBeenCalled();
  });

  it('PD-T17: the response is application/pdf with the %PDF- body, or a plain-text 404 when there is no PDF', async () => {
    const ok = await getCvPdf('es', () => Promise.resolve(PDF));
    expect(ok).not.toBeNull();
    const response = await cvPdfResponse('es');
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    resetCvPdfMemo();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // A resume the document cannot render makes the real renderer path fail.
    getResume.mockResolvedValue({ resume: {}, source: 'api' });
    const missing = await cvPdfResponse('en');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Type')).toMatch(/^text\/plain/);
  });
});
