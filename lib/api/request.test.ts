// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { ApiFetchError, ResumeFetchError } from './errors';
import { fetchResume } from './client';
import { requestJson, type Resource } from './request';

let server: TestServer | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

const THING: Resource<{ ok: true }> = {
  name: 'Thing',
  file: 'thing',
  path: '/api/v1/thing',
  parse: (raw) => (typeof raw === 'object' && raw !== null && 'ok' in raw ? { ok: true } : null),
};
const FAST = { retryDelayMs: 1 };

describe('requestJson', () => {
  it('extra (PA): requests do not go through the global fetch, which Next.js caches in .next/cache/fetch-cache (stale content)', async () => {
    server = await startServer((_req, res) => json(res, 200, { ok: true }));
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(requestJson(THING, 'es', { baseUrl: server.url, ...FAST })).resolves.toEqual({ ok: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('extra (PA): a refused connection is reported with its cause (ECONNREFUSED), never an empty message', async () => {
    const url = await closedPortUrl();
    const error = await requestJson(THING, 'es', { baseUrl: url, retries: 0, ...FAST }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiFetchError);
    expect((error as Error).message).toMatch(/request failed \(.*ECONNREFUSED/);
  });

  it('HX-T7: asks for ?lang=<lang> and retries only transport errors and 5xx, never 4xx', async () => {
    server = await startServer((_req, res) => json(res, 200, { ok: true }));
    await requestJson(THING, 'en', { baseUrl: server.url, ...FAST });
    expect(server.requests).toEqual(['/api/v1/thing?lang=en']);
    await server.close();

    server = await startServer((_req, res) => json(res, 503, { code: 'UNEXPECTED' }));
    const serverError = await requestJson(THING, 'es', { baseUrl: server.url, retries: 2, ...FAST }).catch((e: unknown) => e);
    expect(serverError).toBeInstanceOf(ApiFetchError);
    expect(server.requests).toHaveLength(3);
    await server.close();

    server = await startServer((_req, res) => json(res, 404, { title: 't', detail: 'd', status: 404, code: 'NOT_FOUND' }));
    const missing = await requestJson(THING, 'es', { baseUrl: server.url, retries: 2, ...FAST }).catch((e: unknown) => e);
    expect(missing).toMatchObject({ status: 404, code: 'NOT_FOUND', resource: 'Thing' });
    expect((missing as Error).message).toMatch(/^Thing \(es\): API answered HTTP 404 \(NOT_FOUND\)/);
    expect(server.requests).toHaveLength(1);
  });

  it('HX-T8: fetchResume keeps its contract on top of the generic transport (T1–T22 stay green)', async () => {
    server = await startServer((_req, res) => json(res, 404, { title: 't', detail: 'd', status: 404, code: 'RESUME_NOT_FOUND' }));
    const error = await fetchResume('es', { baseUrl: server.url, retries: 0 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResumeFetchError);
    expect(error).toBeInstanceOf(ApiFetchError);
    expect(server.requests).toEqual(['/api/v1/resume?lang=es']);
  });
});
