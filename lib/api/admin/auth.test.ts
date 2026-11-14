// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { adminChangePassword, adminLogin, adminLogoutAll, adminSession } from './auth';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const LOGIN = { accessToken: 'jwt-example', tokenType: 'Bearer', expiresAt: '2026-11-12T20:15:00Z' };
const ctx = (baseUrl: string) => ({ baseUrl, token: 'jwt', retryDelayMs: 1 });

describe('auth operations', () => {
  it('T212: adminLogin is ok only with accessToken, tokenType Bearer and a valid expiresAt; otherwise invalid', async () => {
    const bodies: unknown[] = [LOGIN, { ...LOGIN, accessToken: undefined }, { ...LOGIN, expiresAt: 'tomorrow' }, { ...LOGIN, expiresAt: 5 }, { ...LOGIN, tokenType: 'Basic' }, []];
    let next = 0;
    server = await startServer((_req, res) => json(res, 200, bodies[next++]));
    const results = [];
    for (let i = 0; i < bodies.length; i += 1) results.push(await adminLogin('una frase larga y secreta', { baseUrl: server.url }));
    expect(results.map((r) => r.kind)).toEqual(['ok', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid']);
    expect(results[0]).toMatchObject({ kind: 'ok', data: LOGIN });
  });

  it('T213: adminLogin sends the password as JSON without a token and maps 401, 429 (Retry-After) and 400 to problems', async () => {
    const answers = [
      { status: 401, body: { code: 'ADMIN_INVALID_CREDENTIALS' }, headers: {} },
      { status: 429, body: { code: 'ADMIN_LOGIN_LOCKED' }, headers: { 'Retry-After': '900' } },
      { status: 400, body: { code: 'BAD_REQUEST' }, headers: {} },
    ];
    let next = 0;
    let seen = '';
    server = await startServer((req, res) => {
      const answer = answers[next++];
      req.on('data', (chunk: Buffer) => (seen += chunk.toString()));
      req.on('end', () => {
        res.writeHead(answer?.status ?? 500, { 'Content-Type': 'application/problem+json', ...answer?.headers });
        res.end(JSON.stringify(answer?.body));
      });
    });
    const results = [];
    for (let i = 0; i < 3; i += 1) results.push(await adminLogin('pw', { baseUrl: server.url, clientIp: '203.0.113.7' }));
    expect(results).toMatchObject([
      { kind: 'problem', status: 401, code: 'ADMIN_INVALID_CREDENTIALS' },
      { kind: 'problem', status: 429, code: 'ADMIN_LOGIN_LOCKED', retryAfterSeconds: 900 },
      { kind: 'problem', status: 400, code: 'BAD_REQUEST' },
    ]);
    expect(seen.replaceAll('}{', '}\n{').split('\n')).toEqual(Array(3).fill('{"password":"pw"}'));
    expect(server.headers.every((headers) => headers.authorization === undefined)).toBe(true);
    expect(server.requests).toEqual(Array(3).fill('/api/v1/admin/auth/login'));
  });

  it('T214: session, password (200/403/422/429) and logout-all (204 without a body) are parsed', async () => {
    server = await startServer((req, res) => {
      const route = `${req.method} ${req.url}`;
      if (route === 'GET /api/v1/admin/auth/session') return json(res, 200, { authenticated: true, expiresAt: '2026-11-12T20:15:00Z', passwordChangedAt: '2026-11-01T08:00:00Z' });
      if (route === 'POST /api/v1/admin/auth/logout-all') {
        res.writeHead(204);
        return res.end();
      }
      req.resume();
      req.on('end', () => {
        const calls = server?.requests.filter((url) => url === '/api/v1/admin/auth/password').length ?? 0;
        if (calls === 1) return json(res, 200, LOGIN);
        if (calls === 2) return json(res, 403, { code: 'ADMIN_CURRENT_PASSWORD_WRONG' }, 'application/problem+json');
        if (calls === 3) return json(res, 422, { code: 'ADMIN_WEAK_PASSWORD' }, 'application/problem+json');
        res.writeHead(429, { 'Content-Type': 'application/problem+json', 'Retry-After': '30' });
        res.end('{"code":"ADMIN_LOGIN_LOCKED"}');
      });
    });
    const base = ctx(server.url);
    expect(await adminSession(base)).toMatchObject({ kind: 'ok', data: { authenticated: true, expiresAt: '2026-11-12T20:15:00Z', passwordChangedAt: '2026-11-01T08:00:00Z' } });
    expect(await adminLogoutAll(base)).toMatchObject({ kind: 'ok', status: 204, data: true });
    const change = { currentPassword: 'una frase larga y secreta', newPassword: 'otra frase larga y secreta' };
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await adminChangePassword(change, base));
    expect(results).toMatchObject([
      { kind: 'ok', data: LOGIN },
      { kind: 'problem', status: 403, code: 'ADMIN_CURRENT_PASSWORD_WRONG' },
      { kind: 'problem', status: 422, code: 'ADMIN_WEAK_PASSWORD' },
      { kind: 'problem', status: 429, retryAfterSeconds: 30 },
    ]);
  });

  it('T214 (bad session): a session answer without authenticated:true or with a bad instant is invalid', async () => {
    const bodies = [{ authenticated: false, expiresAt: '2026-11-12T20:15:00Z' }, { authenticated: true, expiresAt: 'x' }, { authenticated: true, expiresAt: '2026-11-12T20:15:00Z' }];
    let next = 0;
    server = await startServer((_req, res) => json(res, 200, bodies[next++]));
    const kinds = [];
    for (let i = 0; i < 3; i += 1) kinds.push((await adminSession(ctx(server.url))).kind);
    // A session without `passwordChangedAt` is still valid (never changed).
    expect(kinds).toEqual(['invalid', 'invalid', 'ok']);
  });
});
