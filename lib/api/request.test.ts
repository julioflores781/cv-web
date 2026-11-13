// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
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

  describe('request id and logs', () => {
    it('W6: sends X-Request-Id (32 hex) and the retry reuses the same id; two reads get different ids', async () => {
      const ids: Array<string | string[] | undefined> = [];
      let calls = 0;
      server = await startServer((req, res) => {
        ids.push(req.headers['x-request-id']);
        if (calls++ === 0) json(res, 503, { code: 'UNEXPECTED' });
        else json(res, 200, { ok: true });
      });
      await requestJson(THING, 'es', { baseUrl: server.url, ...FAST });
      expect(ids).toHaveLength(2);
      expect(ids[0]).toMatch(/^[0-9a-f]{32}$/);
      expect(ids[1]).toBe(ids[0]);
      await requestJson(THING, 'es', { baseUrl: server.url, ...FAST });
      expect(ids[2]).toMatch(/^[0-9a-f]{32}$/);
      expect(ids[2]).not.toBe(ids[0]);
    });

    it('W6 extra: an id given by the caller is the one sent', async () => {
      let seen: string | string[] | undefined;
      server = await startServer((req, res) => {
        seen = req.headers['x-request-id'];
        json(res, 200, { ok: true });
      });
      await requestJson(THING, 'es', { baseUrl: server.url, requestId: 'fixed-request-id', ...FAST });
      expect(seen).toBe('fixed-request-id');
    });

    it('W7: a 503 leaves one WARN per attempt with event, request_id, path without query, status, attempt and duration, and no host nor body', async () => {
      const logs = captureLogs();
      const ids: Array<string | string[] | undefined> = [];
      server = await startServer((req, res) => {
        ids.push(req.headers['x-request-id']);
        json(res, 503, { title: 'CANARY-BODY', detail: 'CANARY-BODY', status: 503, code: 'UNAVAILABLE' });
      });
      await expect(requestJson(THING, 'es', { baseUrl: server.url, ...FAST })).rejects.toBeInstanceOf(ApiFetchError);
      const lines = logs.lines();
      expect(lines).toHaveLength(2);
      lines.forEach((line, i) => {
        expect(line.stream).toBe('stderr');
        expect(line.entry).toMatchObject({
          level: 'warn',
          event: 'api_call',
          request_id: ids[0],
          path: '/api/v1/thing',
          outcome: 'http_error',
          status: 503,
          attempt: i + 1,
        });
        expect(line.entry.duration_ms).toEqual(expect.any(Number));
        expect(line.raw).not.toMatch(/127\.0\.0\.1|localhost|lang=|\?|CANARY|UNAVAILABLE/);
      });
    });

    it('W8: a timeout and a refused connection log outcome timeout and unreachable with no cause, host nor code of the error', async () => {
      const logs = captureLogs();
      server = await startServer(() => undefined);
      const silent = server.url;
      await expect(requestJson(THING, 'es', { baseUrl: silent, retries: 0, timeoutMs: 40 })).rejects.toThrow(/timed out/);
      const closed = await closedPortUrl();
      await expect(requestJson(THING, 'es', { baseUrl: closed, retries: 0 })).rejects.toThrow(/ECONNREFUSED/);
      expect(logs.lines().map((line) => line.entry)).toMatchObject([
        { event: 'api_call', outcome: 'timeout', attempt: 1 },
        { event: 'api_call', outcome: 'unreachable', attempt: 1 },
      ]);
      expect(logs.lines()[1]?.entry).not.toHaveProperty('status');
      expect(logs.text()).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|AggregateError/);
    });

    it('C1: a refused connection fails with only its code: no host, port, address nor cause on the error (Next prints them)', async () => {
      const closed = await closedPortUrl();
      const port = new URL(closed).port;
      const error = (await requestJson(THING, 'es', { baseUrl: closed, retries: 0 }).catch((e: unknown) => e)) as ApiFetchError;
      expect(error.message).toBe('Thing (es): request failed (ECONNREFUSED)');
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(port);
    });

    it('C1: invalid JSON keeps no piece of the body in the error', async () => {
      server = await startServer((_req, res) => json(res, 200, '{ CANARY-BODY'));
      const error = (await requestJson(THING, 'es', { baseUrl: server.url, retries: 0 }).catch((e: unknown) => e)) as ApiFetchError;
      expect(error.message).toBe('Thing (es): response is not valid JSON');
      expect(error.cause).toBeUndefined();
    });

    it('W9: broken JSON and a wrong shape log outcome invalid_response with the status of the answer', async () => {
      const logs = captureLogs();
      server = await startServer((_req, res) => json(res, 200, '{ not json'));
      await expect(requestJson(THING, 'es', { baseUrl: server.url, retries: 0 })).rejects.toThrow(/not valid JSON/);
      await server.close();
      server = await startServer((_req, res) => json(res, 200, { other: 1 }));
      await expect(requestJson(THING, 'es', { baseUrl: server.url, retries: 0 })).rejects.toThrow(/shape/);
      expect(logs.lines().map((line) => line.entry)).toMatchObject([
        { event: 'api_call', outcome: 'invalid_response', status: 200 },
        { event: 'api_call', outcome: 'invalid_response', status: 200 },
      ]);
    });

    it('W10: a correct answer, and a failed attempt followed by one, leave no line for the success itself', async () => {
      const logs = captureLogs();
      server = await startServer((_req, res) => json(res, 200, { ok: true }));
      await requestJson(THING, 'es', { baseUrl: server.url, ...FAST });
      expect(logs.lines()).toEqual([]);
    });

    it('W15: an error whose message holds a URL with a token never reaches the log (nor the URL of the API)', async () => {
      const logs = captureLogs();
      const leaky: Resource<{ ok: true }> = {
        ...THING,
        fail: (lang, message, details) =>
          new ApiFetchError('Thing', lang, `${message} https://cv-api.internal/x?token=CANARY-TOKEN`, details),
      };
      const closed = await closedPortUrl();
      await expect(requestJson(leaky, 'es', { baseUrl: `${closed}/prefix?key=CANARY-KEY`, retries: 0 })).rejects.toBeInstanceOf(ApiFetchError);
      expect(logs.lines()).toHaveLength(1);
      expect(logs.text()).not.toMatch(/CANARY|cv-api|https?:|prefix/);
    });
  });
});
