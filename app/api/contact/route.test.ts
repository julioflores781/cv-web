// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
import { closedPortUrl, json, startServer, type Handler, type TestServer } from '@/tests/helpers/http-server';
import { DELETE, GET, PATCH, POST, PUT } from './route';

let server: TestServer | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await server?.close();
  server = undefined;
});

const VALID = { name: 'Ada', email: 'ada@example.test', message: 'Un mensaje de ejemplo', website: '' };
const problem = (status: number, code: string) => ({ title: 't', detail: 'd', status, code });

/** Starts an API that records the bodies it receives and answers `handler` (default 201). */
async function api(handler: Handler = (_req, res) => res.writeHead(201).end()) {
  const bodies: string[] = [];
  server = await startServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      bodies.push(body);
      handler(req, res);
    });
  });
  vi.stubEnv('CV_API_URL', server.url);
  return { bodies, server };
}

const post = (body: unknown, init: { query?: string; headers?: Record<string, string> } = {}) =>
  POST(
    new Request(`http://web.test/api/contact/${init.query ?? ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const CANARIES = {
  name: 'CANARY-NAME-Zed',
  email: 'canary-email@example.test',
  message: 'CANARY-MESSAGE contenido privado de ejemplo',
  website: 'CANARY-WEBSITE',
};
const IP = '203.0.113.77';
const LEAKY = { 'CF-Connecting-IP': IP, Cookie: 'sid=CANARY-COOKIE', Authorization: 'Bearer CANARY-AUTH' };

describe('POST /api/contact', () => {
  it('T74: a valid message with the API at 201 answers 201 without body, no-store and no cookie', async () => {
    const { bodies } = await api();
    const response = await post(VALID);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(bodies).toHaveLength(1);
  });

  it('T75: a 400 CONTACT_INVALID or a 429 from the API keep the status and the problem+json', async () => {
    for (const [status, code] of [[400, 'CONTACT_INVALID'], [429, 'CONTACT_RATE_LIMITED']] as const) {
      await server?.close();
      await api((_req, res) => json(res, status, problem(status, code), 'application/problem+json'));
      const response = await post(VALID);
      expect(response.status).toBe(status);
      expect(response.headers.get('Content-Type')).toBe('application/problem+json');
      expect(await response.json()).toEqual(problem(status, code));
    }
  });

  it('T76: an API that is down, broken or silent answers 502/504 with CONTACT_UPSTREAM/CONTACT_TIMEOUT and no internal detail', async () => {
    vi.stubEnv('CV_API_URL', await closedPortUrl());
    const down = await post(VALID);
    expect(down.status).toBe(502);
    const downBody = await down.text();
    expect(JSON.parse(downBody)).toMatchObject({ code: 'CONTACT_UPSTREAM', status: 502 });
    expect(downBody).not.toMatch(/127\.0\.0\.1|ECONNREFUSED|http:/);

    await api((_req, res) => json(res, 500, problem(500, 'UNEXPECTED')));
    const broken = await post(VALID);
    expect(broken.status).toBe(502);
    expect(await broken.json()).toMatchObject({ code: 'CONTACT_UPSTREAM' });
  });

  it('T77: oversized bodies (413), a wrong Content-Type (415) and invalid JSON or fields (400) never reach the API', async () => {
    const { bodies } = await api();
    const status = async (response: Promise<Response>) => (await response).status;
    expect(await status(post({ ...CANARIES, message: `CANARY-MESSAGE${'x'.repeat(9000)}` }, { headers: LEAKY }))).toBe(413);
    expect(await status(post(JSON.stringify(CANARIES), { headers: { ...LEAKY, 'Content-Type': 'text/plain' } }))).toBe(415);
    expect(await status(post('{not json CANARY-RAW', { headers: LEAKY }))).toBe(400);
    expect(await status(post('[1,2]'))).toBe(400);
    expect(await status(post({ ...VALID, name: 5 }))).toBe(400);
    expect(await status(post({ ...VALID, website: 5 }))).toBe(400);
    expect(await status(post({ ...VALID, name: '   ' }))).toBe(400);
    expect(await status(post({ ...VALID, email: 'not-an-email' }))).toBe(400);
    expect(await status(post({ ...VALID, message: 'corto' }))).toBe(400);
    expect(await status(post({ ...VALID, message: 'x'.repeat(2001) }))).toBe(400);
    const invalid = await post({ ...VALID, email: 'nope' }, { query: '?lang=en' });
    expect(await invalid.json()).toMatchObject({ code: 'CONTACT_INVALID', detail: 'The "email" field is not valid.' });
    expect(bodies).toEqual([]);
  });

  it('T77: a body over the limit is refused even when Content-Length is missing or lies', async () => {
    const { bodies } = await api();
    const big = new Request('http://web.test/api/contact/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '10' },
      body: JSON.stringify({ ...VALID, message: 'x'.repeat(9000) }),
    });
    expect((await POST(big)).status).toBe(413);
    expect(bodies).toEqual([]);
  });

  it('T78: GET, PUT, PATCH and DELETE answer 405 with Allow: POST', async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('POST');
    }
  });

  it('T79: the honeypot website is forwarded as is', async () => {
    const { bodies } = await api();
    await post({ ...VALID, website: 'http://spam.test' });
    expect(JSON.parse(bodies[0] ?? '')).toMatchObject({ website: 'http://spam.test' });
  });

  it('T81: lang=en reaches the API as ?lang=en; fr or none become es', async () => {
    await api();
    for (const [query, expected] of [['?lang=en', 'en'], ['?lang=fr', 'es'], ['', 'es']] as const) {
      await post(VALID, { query });
      expect(server?.requests.at(-1)).toBe(`/api/v1/contact/messages?lang=${expected}`);
    }
  });

  it('extra: the visitor IP from CF-Connecting-IP reaches the API', async () => {
    let ip: string | string[] | undefined;
    await api((req, res) => {
      ip = req.headers['cf-connecting-ip'];
      res.writeHead(201).end();
    });
    await post(VALID, { headers: { 'CF-Connecting-IP': '203.0.113.9', 'X-Forwarded-For': '9.9.9.9' } });
    expect(ip).toBe('203.0.113.9');
  });

  describe('logs and request id', () => {

    it('W13: every outcome leaves one contact line with outcome, status, code or reason (a field name), the level and the X-Request-Id of the response', async () => {
      const logs = captureLogs();
      const cases: Array<{ run: () => Promise<Response>; outcome: string; status: number; level: string; extra: Record<string, unknown> }> = [
        { run: () => post(CANARIES, { headers: LEAKY }), outcome: 'sent', status: 201, level: 'info', extra: {} },
        { run: () => post(CANARIES, { headers: LEAKY }), outcome: 'rejected', status: 400, level: 'info', extra: { code: 'CONTACT_INVALID' } },
        { run: () => post(CANARIES, { headers: LEAKY }), outcome: 'rejected', status: 429, level: 'info', extra: { code: 'CONTACT_RATE_LIMITED' } },
        { run: () => post(CANARIES, { headers: LEAKY }), outcome: 'upstream_error', status: 502, level: 'warn', extra: {} },
        { run: () => post(CANARIES, { headers: LEAKY }), outcome: 'timeout', status: 504, level: 'warn', extra: {} },
        { run: () => post(CANARIES, { headers: LEAKY }), outcome: 'unreachable', status: 502, level: 'warn', extra: {} },
        { run: () => post(JSON.stringify(CANARIES), { headers: { ...LEAKY, 'Content-Type': 'text/plain' } }), outcome: 'invalid', status: 415, level: 'info', extra: { reason: 'content_type' } },
        { run: () => post({ ...CANARIES, message: `CANARY-MESSAGE${'x'.repeat(9000)}` }, { headers: LEAKY }), outcome: 'invalid', status: 413, level: 'info', extra: { reason: 'too_large' } },
        { run: () => post('{not json CANARY-RAW', { headers: LEAKY }), outcome: 'invalid', status: 400, level: 'info', extra: { code: 'BAD_REQUEST', reason: 'malformed_body' } },
        { run: () => post({ ...CANARIES, email: 'CANARY-email-invalid' }, { headers: LEAKY }), outcome: 'invalid', status: 400, level: 'info', extra: { code: 'CONTACT_INVALID', reason: 'email' } },
      ];
      const replies: Handler[] = [
        (_req, res) => res.writeHead(201).end(),
        (_req, res) => json(res, 400, problem(400, 'CONTACT_INVALID'), 'application/problem+json'),
        (_req, res) => json(res, 429, problem(429, 'CONTACT_RATE_LIMITED'), 'application/problem+json'),
        (_req, res) => json(res, 500, problem(500, 'UNEXPECTED')),
        () => undefined,
        (_req, res) => res.destroy(),
      ];
      for (const [i, { run, outcome, status, level, extra }] of cases.entries()) {
        await server?.close();
        if (i < replies.length) await api(replies[i]);
        else await api();
        if (outcome === 'timeout') {
          vi.useFakeTimers({ toFake: ['setTimeout'] });
        }
        const pending = run();
        if (outcome === 'timeout') await vi.advanceTimersByTimeAsync(10_000);
        const response = await pending;
        vi.useRealTimers();
        const lines = logs.events('contact');
        const entry = lines.at(-1);
        expect(lines, outcome).toHaveLength(i + 1);
        expect(entry, outcome).toMatchObject({ event: 'contact', outcome, status, level, ...extra });
        expect(entry?.duration_ms).toEqual(expect.any(Number));
        expect(response.status).toBe(status);
        expect(response.headers.get('X-Request-Id')).toBe(entry?.request_id);
        expect(entry?.request_id).toMatch(/^[0-9a-f]{32}$/);
      }
      expect(logs.lines().filter((line) => line.entry.event !== 'contact')).toEqual([]);
      // Whatever the outcome, no line holds a form value, the visitor IP, a header value nor the API address.
      for (const line of logs.lines()) expect(line.raw).not.toMatch(/CANARY|203\.0\.113|127\.0\.0\.1|sid=/);
      for (const line of logs.lines()) expect(Object.keys(line.entry).sort()).toEqual(
        ['code', 'duration_ms', 'event', 'level', 'outcome', 'reason', 'request_id', 'service', 'status', 'timestamp'].filter((key) => key in line.entry),
      );
      const streams = logs.lines().map((line) => [line.entry.level, line.stream]);
      for (const [level, stream] of streams) expect(stream).toBe(level === 'info' ? 'stdout' : 'stderr');
    });

    it('W14: a message with canaries in every field and CF-Connecting-IP leaves no canary nor IP in any line, sent or with the API down', async () => {
      const logs = captureLogs();
      const headers = { 'CF-Connecting-IP': IP, Cookie: 'sid=CANARY-COOKIE', Authorization: 'Bearer CANARY-AUTH' };
      const seen: Array<string | string[] | undefined> = [];
      await api((req, res) => {
        seen.push(req.headers['x-request-id']);
        res.writeHead(201).end();
      });
      const ok = await post(CANARIES, { headers });
      expect(ok.status).toBe(201);
      await server?.close();
      vi.stubEnv('CV_API_URL', await closedPortUrl());
      const down = await post(CANARIES, { headers });
      expect(down.status).toBe(502);

      expect(logs.events('contact')).toHaveLength(2);
      expect(logs.events('contact')[0]?.request_id).toBe(seen[0]);
      const everything = logs.text();
      for (const canary of [...Object.values(CANARIES), IP, 'CANARY-COOKIE', 'CANARY-AUTH', '127.0.0.1']) expect(everything, canary).not.toContain(canary);
      expect(everything).not.toMatch(/CANARY|203\.0\.113/);
    });
  });
});
