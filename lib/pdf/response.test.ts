// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeEs } from '@/tests/fixtures/resume';
import { resetCvPdfMemo } from './build-cv-pdf';
import { contentHash } from './cache-key';
import { cvPdfResponse } from './response';

const getResume = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ getResume }));

const request = (ifNoneMatch?: string) => new Request('http://x/cv.pdf', ifNoneMatch ? { headers: { 'If-None-Match': ifNoneMatch } } : {});

beforeEach(() => {
  resetCvPdfMemo();
  getResume.mockReset();
  getResume.mockResolvedValue({ resume: resumeEs });
});

afterEach(() => vi.restoreAllMocks());

describe('cvPdfResponse', () => {
  it('T67: 200 with inline disposition, no-cache and the hash as ETag; a matching If-None-Match is 304 without body, another value is 200', async () => {
    const etag = `"${contentHash(resumeEs)}"`;
    const ok = await cvPdfResponse('es', request());
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Content-Type')).toBe('application/pdf');
    expect(ok.headers.get('Content-Disposition')).toBe('inline; filename="cv-julio-flores-es.pdf"');
    expect(ok.headers.get('Cache-Control')).toBe('no-cache');
    expect(ok.headers.get('ETag')).toBe(etag);
    expect(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');

    const notModified = await cvPdfResponse('es', request(etag));
    expect(notModified.status).toBe(304);
    expect(notModified.headers.get('ETag')).toBe(etag);
    expect(await notModified.text()).toBe('');
    expect((await cvPdfResponse('es', request(`W/${etag}`))).status).toBe(304);

    const other = await cvPdfResponse('es', request('"otro"'));
    expect(other.status).toBe(200);
    expect(other.headers.get('Content-Disposition')).toContain('cv-julio-flores-es.pdf');
  });

  it('T65: a resume the document cannot render gives a plain-text 404 with a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getResume.mockResolvedValue({ resume: {} });
    const missing = await cvPdfResponse('en', request());
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Type')).toMatch(/^text\/plain/);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
