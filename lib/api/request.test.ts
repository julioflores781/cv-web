// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { ApiFetchError } from './errors';
import { DEFAULT_RETRIES, DEFAULT_TIMEOUT_MS, requestJson, type Resource } from './request';

let server: TestServer | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

const THING: Resource<{ ok: true }> = {
  name: 'Thing',
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

  it('T22: a refused connection is reported with its cause (ECONNREFUSED), never an empty message', async () => {
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

  it('T19: the defaults are a 4000 ms timeout and 1 retry', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(4000);
    expect(DEFAULT_RETRIES).toBe(1);
  });

  it('T20: a 5xx followed by a 200 is retried once and returns the data; a 4xx is not retried', async () => {
    let calls = 0;
    server = await startServer((_req, res) => (calls++ === 0 ? json(res, 503, { code: 'UNEXPECTED' }) : json(res, 200, { ok: true })));
    await expect(requestJson(THING, 'es', { baseUrl: server.url, ...FAST })).resolves.toEqual({ ok: true });
    expect(server.requests).toHaveLength(2);
    await server.close();

    server = await startServer((_req, res) => json(res, 404, { code: 'NOT_FOUND' }));
    await expect(requestJson(THING, 'es', { baseUrl: server.url, ...FAST })).rejects.toBeInstanceOf(ApiFetchError);
    expect(server.requests).toHaveLength(1);
  });

  it('T21: a server that never answers fails around the default timeout with «timed out after 4000 ms»', async () => {
    server = await startServer(() => {
      // Never answers.
    });
    const started = Date.now();
    await expect(requestJson(THING, 'es', { baseUrl: server.url, retries: 0 })).rejects.toThrow(/timed out after 4000 ms/);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(3900);
    expect(elapsed).toBeLessThan(6000);
  });
});
