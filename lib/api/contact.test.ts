// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { forwardContact, type ContactPayload } from './contact';

const payload: ContactPayload = { name: 'Ada', email: 'ada@example.test', message: 'Un mensaje de ejemplo', website: '' };
let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

interface Seen {
  method: string | undefined;
  url: string | undefined;
  headers: Record<string, unknown>;
  names: string[];
  body: string;
}

/** Starts an API that records the first request and answers `reply`. */
async function api(reply: (res: Parameters<Parameters<typeof startServer>[0]>[1]) => void = (res) => res.writeHead(201).end()) {
  const seen: { value?: Seen } = {};
  server = await startServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      seen.value ??= { method: req.method, url: req.url, headers: req.headers, names: req.rawHeaders.filter((_, i) => i % 2 === 0).map((n) => n.toLowerCase()), body };
      reply(res);
    });
  });
  return { seen, url: server.url };
}

const problem = (status: number, code: string) => ({ title: 't', detail: 'd', status, code });

describe('forwardContact', () => {
  it('T70: POSTs /api/v1/contact/messages?lang=es with Content-Type JSON, the trimmed-value JSON and the visitor IP', async () => {
    const { seen, url } = await api();
    const result = await forwardContact({ lang: 'es', payload, clientIp: '203.0.113.9', baseUrl: url });
    expect(result).toEqual({ kind: 'sent' });
    expect(seen.value?.method).toBe('POST');
    expect(seen.value?.url).toBe('/api/v1/contact/messages?lang=es');
    expect(seen.value?.headers['content-type']).toBe('application/json');
    expect(seen.value?.headers['cf-connecting-ip']).toBe('203.0.113.9');
    expect(JSON.parse(seen.value?.body ?? '')).toEqual({ name: 'Ada', email: 'ada@example.test', message: 'Un mensaje de ejemplo', website: '' });
  });

  it('T71: only Content-Type and a valid CF-Connecting-IP are sent; cookies, auth, UA, referer and XFF never are', async () => {
    const { seen, url } = await api();
    await forwardContact({ lang: 'es', payload, clientIp: '2001:db8::1', baseUrl: url });
    // Node itself adds Host and Connection (and Content-Length for the body); nothing else may appear.
    expect(seen.value?.names.sort()).toEqual(['cf-connecting-ip', 'connection', 'content-length', 'content-type', 'host']);
    for (const bad of ['<script>', '1.2.3.4, 5.6.7.8', `1.${'2'.repeat(50)}`, '', '   ', null, undefined]) {
      await server?.close();
      const next = await api();
      await forwardContact({ lang: 'es', payload, clientIp: bad, baseUrl: next.url });
      expect(next.seen.value?.names, String(bad)).toEqual(expect.not.arrayContaining(['cf-connecting-ip']));
      expect(next.seen.value?.names, String(bad)).toEqual(expect.not.arrayContaining(['cookie', 'authorization', 'user-agent', 'referer', 'x-forwarded-for']));
    }
  });

  it('T72: 201 sent, 400 and 429 problems pass through, 500 is upstream-error, silence is timeout and a closed port is unreachable', async () => {
    const answer = async (reply: Parameters<typeof api>[0], extra: { timeoutMs?: number } = {}) => {
      await server?.close();
      const { url } = await api(reply);
      return forwardContact({ lang: 'es', payload, baseUrl: url, ...extra });
    };
    expect(await answer((res) => res.writeHead(201).end())).toEqual({ kind: 'sent' });
    expect(await answer((res) => json(res, 400, problem(400, 'CONTACT_INVALID'), 'application/problem+json'))).toEqual({
      kind: 'rejected',
      status: 400,
      problem: problem(400, 'CONTACT_INVALID'),
    });
    expect(await answer((res) => json(res, 429, problem(429, 'CONTACT_RATE_LIMITED'), 'application/problem+json'))).toEqual({
      kind: 'rejected',
      status: 429,
      problem: problem(429, 'CONTACT_RATE_LIMITED'),
    });
    expect(await answer((res) => json(res, 500, problem(500, 'UNEXPECTED')))).toEqual({ kind: 'upstream-error' });
    expect(await answer((res) => json(res, 400, '<html>not a problem</html>', 'text/html'))).toEqual({ kind: 'upstream-error' });
    expect(await answer((res) => res.writeHead(200).end())).toEqual({ kind: 'upstream-error' });
    expect(await answer(() => undefined, { timeoutMs: 40 })).toEqual({ kind: 'timeout' });
    expect(await forwardContact({ lang: 'es', payload, baseUrl: await closedPortUrl() })).toEqual({ kind: 'unreachable' });
  });

  it('T73: a 5xx is not retried (one request only)', async () => {
    const { url } = await api((res) => json(res, 503, problem(503, 'UNAVAILABLE')));
    expect(await forwardContact({ lang: 'es', payload, baseUrl: url })).toEqual({ kind: 'upstream-error' });
    expect(server?.requests).toHaveLength(1);
  });
});
