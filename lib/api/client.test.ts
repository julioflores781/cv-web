// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureFor, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { fetchResume } from './client';
import { ResumeFetchError } from './errors';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

const FAST = { retries: 0, retryDelayMs: 1 };

describe('fetchResume', () => {
  it('T1: returns the resume and asks for ?lang=es', async () => {
    server = await startServer((_req, res) => json(res, 200, resumeEs));
    const resume = await fetchResume('es', { baseUrl: server.url, ...FAST });
    expect(resume).toEqual(resumeEs);
    expect(server.requests).toEqual(['/api/v1/resume?lang=es']);
  });

  it('T2: asks for lang=en and returns the English content', async () => {
    server = await startServer((_req, res) => json(res, 200, resumeEn));
    const resume = await fetchResume('en', { baseUrl: server.url, ...FAST });
    expect(server.requests[0]).toContain('lang=en');
    expect(resume.language).toBe('en');
    expect(resume.profile.label).toBe(resumeEn.profile.label);
  });

  it('T3: a 404 problem+json becomes a ResumeFetchError with code and status', async () => {
    server = await startServer((_req, res) =>
      json(
        res,
        404,
        { type: 'about:blank', title: 'Not found', status: 404, detail: 'x', code: 'RESUME_NOT_FOUND' },
        'application/problem+json',
      ),
    );
    const error = await fetchResume('es', { baseUrl: server.url, retries: 2, retryDelayMs: 1 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ResumeFetchError);
    expect(error).toMatchObject({ status: 404, code: 'RESUME_NOT_FOUND', lang: 'es' });
    expect(server.requests).toHaveLength(1);
  });

  it('T4: a 500 is retried and then fails with ResumeFetchError', async () => {
    server = await startServer((_req, res) => json(res, 500, { code: 'UNEXPECTED' }, 'application/problem+json'));
    const error = await fetchResume('es', { baseUrl: server.url, retries: 2, retryDelayMs: 1 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ResumeFetchError);
    expect(error).toMatchObject({ status: 500 });
    expect(server.requests).toHaveLength(3);
  });

  it('T5: a 200 with a non-JSON body throws ResumeFetchError', async () => {
    server = await startServer((_req, res) => json(res, 200, '<html>not json</html>', 'text/html'));
    await expect(fetchResume('es', { baseUrl: server.url, ...FAST })).rejects.toBeInstanceOf(ResumeFetchError);
  });

  it('T6: a 200 missing a required field throws a validation error', async () => {
    const broken: Record<string, unknown> = { ...resumeEs };
    delete broken.contact;
    server = await startServer((_req, res) => json(res, 200, broken));
    await expect(fetchResume('es', { baseUrl: server.url, ...FAST })).rejects.toThrow(/expected resume shape/);
  });

  it('T7: a response in another language than requested throws a language mismatch', async () => {
    server = await startServer((_req, res) => json(res, 200, resumeEs));
    await expect(fetchResume('en', { baseUrl: server.url, ...FAST })).rejects.toThrow(/language mismatch/);
  });

  it('T8: a server slower than the timeout is aborted in bounded time', async () => {
    server = await startServer(() => {
      // Never answers.
    });
    const started = Date.now();
    await expect(fetchResume('es', { baseUrl: server.url, timeoutMs: 150, ...FAST })).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('T9: a closed port throws ResumeFetchError', async () => {
    const baseUrl = await closedPortUrl();
    await expect(fetchResume('es', { baseUrl, ...FAST })).rejects.toBeInstanceOf(ResumeFetchError);
  });

  it('extra: retries a transient failure and succeeds', async () => {
    let calls = 0;
    server = await startServer((_req, res) => {
      calls += 1;
      if (calls === 1) json(res, 503, 'busy', 'text/plain');
      else json(res, 200, fixtureFor('es'));
    });
    const resume = await fetchResume('es', { baseUrl: server.url, retries: 2, retryDelayMs: 1 });
    expect(resume.profile.name).toBe('Ada Ejemplo');
    expect(calls).toBe(2);
  });
});
