// @vitest-environment node
import type { IncomingHttpHeaders } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { adminRequest, type AdminRequest } from './client';
import { parseEmpty } from './parse';

let server: TestServer | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

const TOKEN = 'token-CANARY-1234';
const ID = 'abcdef0123456789abcdef0123456789';
const parseAny = (raw: unknown): { raw: unknown } | null => ({ raw });

function call(overrides: Partial<AdminRequest<{ raw: unknown }>> & { baseUrl: string }) {
  return adminRequest({ operation: 'test.op', method: 'GET', path: '/api/v1/admin/thing', parse: parseAny, retryDelayMs: 1, ...overrides });
}

/** Headers that Node itself adds; everything else is chosen by the client. */
const own = (headers: IncomingHttpHeaders): string[] =>
  Object.keys(headers)
    .filter((name) => !['host', 'connection', 'content-length'].includes(name))
    .sort();

describe('adminRequest', () => {
  it('T205: sends only Authorization, X-Request-Id (32 hex), Accept, X-Client-IP and, with a body, Content-Type', async () => {
    server = await startServer((_req, res) => json(res, 200, { ok: true }));
    await call({ baseUrl: server.url, token: TOKEN, clientIp: '203.0.113.7' });
    const get = server.headers[0] ?? {};
    expect(own(get)).toEqual(['accept', 'authorization', 'x-client-ip', 'x-request-id']);
    expect(get.authorization).toBe(`Bearer ${TOKEN}`);
    expect(get['x-client-ip']).toBe('203.0.113.7');
    expect(get['x-request-id']).toMatch(/^[0-9a-f]{32}$/);

    await call({ baseUrl: server.url, method: 'PUT', token: TOKEN, json: { a: 1 } });
    const put = server.headers[1] ?? {};
    expect(own(put)).toEqual(['accept', 'authorization', 'content-type', 'x-request-id']);
    expect(put['content-type']).toBe('application/json');
  });

  it('T206: nothing of the incoming request leaks (CF-*, Cookie, X-Forwarded-For, Referer, User-Agent); X-Client-IP only for a valid address', async () => {
    server = await startServer((_req, res) => json(res, 200, { ok: true }));
    // The incoming request's headers are never handed to the client: only the raw CF-Connecting-IP value is, as `clientIp`.
    const incoming = new Headers({
      'CF-Connecting-IP': '198.51.100.9',
      'CF-Ray': 'abc123-MAD',
      Cookie: 'cv_admin_token=SECRET',
      'X-Forwarded-For': '10.0.0.1',
      Referer: 'https://floreslab.dev/admin/',
      'User-Agent': 'Mozilla/5.0',
    });
    await call({ baseUrl: server.url, token: TOKEN, clientIp: incoming.get('cf-connecting-ip') });
    await call({ baseUrl: server.url, token: TOKEN, clientIp: 'not-an-ip' });
    await call({ baseUrl: server.url, token: TOKEN, clientIp: '198.51.100.9, 10.0.0.1' });
    await call({ baseUrl: server.url, token: TOKEN, clientIp: null });
    const [first, ...others] = server.headers;
    expect(own(first ?? {})).toEqual(['accept', 'authorization', 'x-client-ip', 'x-request-id']);
    expect(first?.['x-client-ip']).toBe('198.51.100.9');
    for (const headers of others) expect(own(headers)).toEqual(['accept', 'authorization', 'x-request-id']);
    for (const headers of server.headers) {
      expect(Object.keys(headers).filter((name) => /^cf-|cookie|forwarded|referer|user-agent|origin/.test(name))).toEqual([]);
    }
  });

  it('T207: reuses a given request id and returns it; generates one otherwise', async () => {
    server = await startServer((_req, res) => json(res, 200, { ok: true }));
    const given = await call({ baseUrl: server.url, requestId: ID });
    expect(given.requestId).toBe(ID);
    expect(server.headers[0]?.['x-request-id']).toBe(ID);
    const generated = await call({ baseUrl: server.url });
    expect(generated.requestId).toMatch(/^[0-9a-f]{32}$/);
    expect(server.headers[1]?.['x-request-id']).toBe(generated.requestId);
    // A malformed id is not trusted: it is replaced.
    const replaced = await call({ baseUrl: server.url, requestId: 'x\r\nInjected: 1' });
    expect(replaced.requestId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('T208: a GET is retried once (same id) on 500 or a reset; a 4xx is not; a write is never retried', async () => {
    server = await startServer((_req, res) => json(res, 500, { code: 'UNEXPECTED' }));
    const failed = await call({ baseUrl: server.url });
    expect(failed.kind).toBe('problem');
    expect(server.requests).toHaveLength(2);
    expect(server.headers[1]?.['x-request-id']).toBe(server.headers[0]?.['x-request-id']);
    await server.close();

    server = await startServer((req) => req.socket.destroy());
    expect((await call({ baseUrl: server.url })).kind).toBe('unreachable');
    expect(server.requests).toHaveLength(2);
    await server.close();

    server = await startServer((_req, res) => json(res, 404, { code: 'NOT_FOUND' }));
    await call({ baseUrl: server.url });
    expect(server.requests).toHaveLength(1);
    await server.close();

    server = await startServer((_req, res) => json(res, 500, { code: 'UNEXPECTED' }));
    for (const method of ['POST', 'PUT', 'DELETE'] as const) await call({ baseUrl: server.url, method, json: method === 'DELETE' ? undefined : {} });
    expect(server.requests).toHaveLength(3);
    await server.close();

    // A write that hits a reset is not retried either.
    server = await startServer((req) => req.socket.destroy());
    expect((await call({ baseUrl: server.url, method: 'POST', json: {} })).kind).toBe('unreachable');
    expect(server.requests).toHaveLength(1);
  });

  it('T209: a mute API, a closed port and invalid JSON give timeout, unreachable and invalid, never with a URL or host', async () => {
    server = await startServer(() => undefined);
    const started = performance.now();
    const timeout = await call({ baseUrl: server.url, timeoutMs: 150, retryDelayMs: 1 });
    expect(timeout.kind).toBe('timeout');
    expect(performance.now() - started).toBeLessThan(2_000);
    await server.close();

    const closed = await closedPortUrl();
    const unreachable = await call({ baseUrl: closed });
    expect(unreachable.kind).toBe('unreachable');

    server = await startServer((_req, res) => json(res, 200, '{"half":'));
    const invalid = await call({ baseUrl: server.url });
    expect(invalid).toMatchObject({ kind: 'invalid', source: 'response' });

    for (const result of [timeout, unreachable, invalid]) expect(JSON.stringify(result)).not.toMatch(/127\.0\.0\.1|localhost|https?:|\{"half"/);
  });

  it('T210: problem+json 401, 403, 409, 422 (errors filtered), 429 (Retry-After) and a bare 4xx map to a typed problem', async () => {
    const answers: Array<{ status: number; body?: unknown; headers?: Record<string, string> }> = [
      { status: 401, body: { title: 'No autorizado', status: 401, code: 'ADMIN_UNAUTHORIZED' } },
      { status: 403, body: { title: 'Mal', status: 403, code: 'ADMIN_CURRENT_PASSWORD_WRONG' } },
      { status: 409, body: { title: 'Cambió', status: 409, code: 'CONTENT_VERSION_CONFLICT' } },
      {
        status: 422,
        body: {
          title: 'No válido',
          code: 'CONTENT_INVALID',
          errors: [{ path: 'es.projects[1].client', code: 'ANONYMOUS_CLIENT_FORBIDDEN' }, { path: 5, code: 'X' }, { path: 'a', code: 'lower' }, 'junk', { path: 'en.x', code: 'REQUIRED', extra: 1 }],
        },
      },
      { status: 429, body: { code: 'ADMIN_LOGIN_LOCKED' }, headers: { 'Retry-After': '900' } },
      { status: 429, body: { code: 'ADMIN_LOGIN_RATE_LIMITED' }, headers: { 'Retry-After': 'soon' } },
      { status: 400 },
    ];
    let next = 0;
    server = await startServer((_req, res) => {
      const answer = answers[next++] ?? { status: 500 };
      res.writeHead(answer.status, { 'Content-Type': 'application/problem+json', ...answer.headers });
      res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
    });
    const results = [];
    for (let i = 0; i < answers.length; i += 1) results.push(await call({ baseUrl: server.url, method: 'POST', json: {} }));
    expect(results.map((r) => (r.kind === 'problem' ? [r.status, r.code] : r.kind))).toEqual([
      [401, 'ADMIN_UNAUTHORIZED'],
      [403, 'ADMIN_CURRENT_PASSWORD_WRONG'],
      [409, 'CONTENT_VERSION_CONFLICT'],
      [422, 'CONTENT_INVALID'],
      [429, 'ADMIN_LOGIN_LOCKED'],
      [429, 'ADMIN_LOGIN_RATE_LIMITED'],
      [400, 'HTTP_400'],
    ]);
    const [, , , invalid, locked, garbage, bare] = results;
    expect(invalid).toMatchObject({ errors: [{ path: 'es.projects[1].client', code: 'ANONYMOUS_CLIENT_FORBIDDEN' }, { path: 'en.x', code: 'REQUIRED' }] });
    expect(locked).toMatchObject({ retryAfterSeconds: 900 });
    expect(garbage && 'retryAfterSeconds' in garbage).toBe(false);
    expect(bare && 'errors' in bare).toBe(false);
  });

  it('T211: a failure logs one admin_api_call WARN with the join fields and nothing sensitive', async () => {
    const logs = captureLogs();
    server = await startServer((_req, res) => json(res, 401, { code: 'ADMIN_UNAUTHORIZED', title: 't' }));
    await call({ baseUrl: server.url, method: 'POST', token: TOKEN, requestId: ID, clientIp: '203.0.113.7', json: { passphrase: 'PASSWORD-CANARY' }, operation: 'auth.login' });
    expect(logs.lines()).toHaveLength(1);
    expect(logs.events('admin_api_call')[0]).toMatchObject({
      level: 'warn',
      event: 'admin_api_call',
      request_id: ID,
      operation: 'auth.login',
      outcome: 'http_error',
      status: 401,
      attempt: 1,
    });
    expect(logs.events('admin_api_call')[0]).toHaveProperty('duration_ms');
    expect(logs.text()).not.toMatch(/CANARY|203\.0\.113|127\.0\.0\.1|Bearer/);
  });

  it('extra: 204 without a body is a success only when 204 is expected; an empty 200 is invalid', async () => {
    server = await startServer((req, res) => {
      res.writeHead(req.url === '/api/v1/admin/thing' ? 204 : 200);
      res.end();
    });
    expect(await adminRequest({ operation: 'test.empty', method: 'GET', path: '/api/v1/admin/thing', baseUrl: server.url, retryDelayMs: 1, parse: parseEmpty, success: [204] })).toMatchObject({ kind: 'ok', status: 204 });
    expect(await call({ baseUrl: server.url, path: '/api/v1/admin/other' })).toMatchObject({ kind: 'invalid' });
  });
});
