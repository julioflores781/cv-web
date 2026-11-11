// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { sendContactMessage } from './client';

const values = { name: ' Ada ', email: 'ada@example.test', message: '  Un mensaje de ejemplo  ' };
let server: TestServer | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  await server?.close();
  server = undefined;
});

const problem = (status: number, code: string, detail = 'd') => ({ title: 't', detail, status, code });
async function against(handler: Parameters<typeof startServer>[0], extra: { timeoutMs?: number; signal?: AbortSignal; website?: string } = {}) {
  server = await startServer(handler);
  return sendContactMessage({ apiUrl: server.url, lang: 'es', values, ...extra });
}

describe('sendContactMessage', () => {
  it('CO-T46: POSTs /api/v1/contact/messages?lang=es with only Content-Type: application/json and exactly name, email, message and website', async () => {
    let seen: { method: string | undefined; url: string | undefined; headers: Record<string, unknown>; raw: string[]; body: string } | undefined;
    const result = await against((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        seen = { method: req.method, url: req.url, headers: req.headers, raw: req.rawHeaders, body };
        res.writeHead(201).end();
      });
    });
    expect(result).toEqual({ kind: 'sent' });
    expect(seen?.method).toBe('POST');
    expect(seen?.url).toBe('/api/v1/contact/messages?lang=es');
    expect(seen?.headers['content-type']).toBe('application/json');
    // Node's fetch adds accept: */* and the like itself; the client sets no header but Content-Type.
    expect(JSON.parse(seen?.body ?? '')).toEqual({ name: 'Ada', email: 'ada@example.test', message: 'Un mensaje de ejemplo', website: '' });
  });

  it('CO-T47: fetch is called with credentials omit, cache no-store, mode cors and a single own header', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));
    vi.stubGlobal('fetch', fetchMock);
    await sendContactMessage({ apiUrl: 'http://api.example.test/', lang: 'en', values, website: 'bot' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.example.test/api/v1/contact/messages?lang=en');
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', mode: 'cors', headers: { 'Content-Type': 'application/json' } });
    expect(Object.keys(init.headers as object)).toEqual(['Content-Type']);
    expect(JSON.parse(init.body as string).website).toBe('bot');
  });

  it('CO-T48: 201 without body is sent; 200 and 204 are http-error', async () => {
    expect(await against((_req, res) => res.writeHead(201).end())).toEqual({ kind: 'sent' });
    await server?.close();
    expect(await against((_req, res) => res.writeHead(200).end())).toEqual({ kind: 'http-error', status: 200 });
    await server?.close();
    expect(await against((_req, res) => res.writeHead(204).end())).toEqual({ kind: 'http-error', status: 204 });
  });

  it('CO-T49: 400 CONTACT_INVALID extracts the field from the Spanish and English details, and leaves it out when unrecognisable', async () => {
    const send = (detail: string) => against((_req, res) => json(res, 400, problem(400, 'CONTACT_INVALID', detail), 'application/problem+json'));
    expect(await send('El campo «email» no es válido.')).toMatchObject({ kind: 'invalid', field: 'email' });
    await server?.close();
    expect(await send('The "email" field is not valid.')).toMatchObject({ kind: 'invalid', field: 'email' });
    await server?.close();
    const unknown = await send('Algo falló.');
    expect(unknown).toMatchObject({ kind: 'invalid', detail: 'Algo falló.' });
    expect('field' in unknown).toBe(false);
    await server?.close();
    expect('field' in (await send('El campo «website» no es válido.'))).toBe(false);
  });

  it('CO-T50: 429 CONTACT_RATE_LIMITED is rate-limited', async () => {
    expect(await against((_req, res) => json(res, 429, problem(429, 'CONTACT_RATE_LIMITED'), 'application/problem+json'))).toEqual({ kind: 'rate-limited' });
  });

  it('CO-T51: 400 BAD_REQUEST and 500 UNEXPECTED are problems with their code', async () => {
    expect(await against((_req, res) => json(res, 400, problem(400, 'BAD_REQUEST'), 'application/problem+json'))).toMatchObject({ kind: 'problem', code: 'BAD_REQUEST', status: 400 });
    await server?.close();
    expect(await against((_req, res) => json(res, 500, problem(500, 'UNEXPECTED'), 'application/problem+json'))).toMatchObject({ kind: 'problem', code: 'UNEXPECTED', status: 500 });
  });

  it('CO-T52: 502 with HTML, 413 and 403 without body are http-error with the status', async () => {
    expect(await against((_req, res) => json(res, 502, '<html>bad gateway</html>', 'text/html'))).toEqual({ kind: 'http-error', status: 502 });
    await server?.close();
    expect(await against((_req, res) => res.writeHead(413).end())).toEqual({ kind: 'http-error', status: 413 });
    await server?.close();
    expect(await against((_req, res) => res.writeHead(403).end())).toEqual({ kind: 'http-error', status: 403 });
  });

  it('CO-T53: a closed port is network and nothing is thrown', async () => {
    expect(await sendContactMessage({ apiUrl: await closedPortUrl(), lang: 'es', values })).toEqual({ kind: 'network' });
  });

  it('CO-T54: a server that never answers times out; a signal aborted by the caller is aborted', async () => {
    expect(await against(() => undefined, { timeoutMs: 40 })).toEqual({ kind: 'timeout' });
    await server?.close();
    const controller = new AbortController();
    const pending = against(() => undefined, { signal: controller.signal, timeoutMs: 5000 });
    setTimeout(() => controller.abort(), 40);
    expect(await pending).toEqual({ kind: 'aborted' });
  });
});
