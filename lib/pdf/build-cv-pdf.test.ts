// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { MAX_CACHED_PDFS, cvPdfCacheSize, getCvPdf, resetCvPdfMemo, type PdfRenderer } from './build-cv-pdf';

const getResume = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ getResume }));

const PDF = Buffer.from('%PDF-1.7 fake');
const withSummary = (summary: string) => ({ ...resumeEs, profile: { ...resumeEs.profile, summary } });

beforeEach(() => {
  resetCvPdfMemo();
  getResume.mockReset();
  getResume.mockResolvedValue({ resume: resumeEs });
});

afterEach(() => vi.restoreAllMocks());

describe('getCvPdf', () => {
  it('PD-T14 / W19: a renderer that throws gives null and one structured warning pdf_render_failed with language and error class (never the message)', async () => {
    const logs = captureLogs();
    class RenderBoom extends Error {
      override name = 'RenderBoom';
    }
    const render: PdfRenderer = () => Promise.reject(new RenderBoom('boom https://x.test/?token=CANARY'));
    await expect(getCvPdf('es', render)).resolves.toBeNull();
    expect(logs.lines()).toHaveLength(1);
    expect(logs.lines()[0]?.stream).toBe('stderr');
    expect(logs.lines()[0]?.entry).toMatchObject({ level: 'warn', service: 'cv-web', event: 'pdf_render_failed', lang: 'es', error: 'RenderBoom' });
    expect(logs.text()).not.toMatch(/boom|CANARY/);
  });

  it('T61: two calls with the same content render once; another language renders again', async () => {
    const render = vi.fn<PdfRenderer>().mockResolvedValue(PDF);
    const first = await getCvPdf('es', render);
    const second = await getCvPdf('es', render);
    expect(first?.buffer).toBe(PDF);
    expect(second?.hash).toBe(first?.hash);
    expect(render).toHaveBeenCalledTimes(1);
    getResume.mockResolvedValue({ resume: resumeEn });
    await getCvPdf('en', render);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('T63: with more distinct contents than the cap the map never exceeds it and drops the least recently used', async () => {
    const render = vi.fn<PdfRenderer>().mockResolvedValue(PDF);
    const call = async (summary: string) => {
      getResume.mockResolvedValue({ resume: withSummary(summary) });
      await getCvPdf('es', render);
    };
    for (const summary of ['a', 'b', 'c', 'd']) await call(summary);
    expect(cvPdfCacheSize()).toBe(MAX_CACHED_PDFS);
    await call('a'); // touches «a»: «b» is now the oldest
    expect(render).toHaveBeenCalledTimes(4);
    await call('e');
    expect(cvPdfCacheSize()).toBe(MAX_CACHED_PDFS);
    expect(render).toHaveBeenCalledTimes(5);
    await call('a'); // still cached
    expect(render).toHaveBeenCalledTimes(5);
    await call('b'); // evicted: renders again
    expect(render).toHaveBeenCalledTimes(6);
    expect(cvPdfCacheSize()).toBe(MAX_CACHED_PDFS);
  });

  it('T64: two simultaneous calls with the same key invoke the renderer once', async () => {
    let release: (buffer: Buffer) => void = () => undefined;
    const render = vi.fn<PdfRenderer>().mockReturnValue(new Promise<Buffer>((resolve) => (release = resolve)));
    const both = Promise.all([getCvPdf('es', render), getCvPdf('es', render)]);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    release(PDF);
    const [a, b] = await both;
    expect(a?.buffer).toBe(PDF);
    expect(b?.buffer).toBe(PDF);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('T65: a failing renderer gives null with a warning and is not stored, so the next call renders again', async () => {
    const logs = captureLogs();
    const render = vi.fn<PdfRenderer>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(PDF);
    await expect(getCvPdf('es', render)).resolves.toBeNull();
    expect(logs.events('pdf_render_failed')).toHaveLength(1);
    expect(cvPdfCacheSize()).toBe(0);
    await expect(getCvPdf('es', render)).resolves.toMatchObject({ buffer: PDF });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('PD-T16: when getResume fails, getCvPdf propagates the error even with a PDF in memory', async () => {
    const render = vi.fn<PdfRenderer>().mockResolvedValue(PDF);
    await getCvPdf('es', render);
    getResume.mockRejectedValue(new Error('Resume (es) unavailable'));
    const logs = captureLogs();
    await expect(getCvPdf('es', render)).rejects.toThrow(/unavailable/);
    expect(logs.lines()).toEqual([]);
  });
});
