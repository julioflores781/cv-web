// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendContactMessage } from './client';

const values = { name: ' Ada ', email: 'ada@example.test', message: '  Un mensaje de ejemplo  ' };
afterEach(() => vi.unstubAllGlobals());

const problem = (status: number, code: string, detail = 'd') => ({ title: 't', detail, status, code });
const reply = (status: number, body?: unknown, type = 'application/problem+json') =>
  new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } });

/** Runs the client against a stubbed `fetch` that answers `handler`. */
function against(handler: (url: string, init: RequestInit) => Promise<Response>, extra: { timeoutMs?: number; signal?: AbortSignal; website?: string; lang?: 'es' | 'en' } = {}) {
  const mock = vi.fn((url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', mock);
  return { mock, result: sendContactMessage({ lang: 'es', values, ...extra }) };
}
const answer = (response: Response) => against(() => Promise.resolve(response)).result;
/** A request that only ends when its signal aborts, like a server that never answers. */
const hang = (_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));

describe('sendContactMessage', () => {
  it('T83 (CO-T46): POSTs the relative /api/contact/?lang=es with only Content-Type: application/json and exactly name, email, message and website', async () => {
    const { mock, result } = against(() => Promise.resolve(reply(201)));
    expect(await result).toEqual({ kind: 'sent' });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/contact/?lang=es');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Ada', email: 'ada@example.test', message: 'Un mensaje de ejemplo', website: '' });
  });

  it('T83 (CO-T47): the call has no mode nor credentials, carries ?lang=en and forwards the honeypot', async () => {
    const { mock, result } = against(() => Promise.resolve(reply(201)), { lang: 'en', website: 'bot' });
    await result;
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/contact/?lang=en');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store' });
    expect('mode' in init).toBe(false);
    expect('credentials' in init).toBe(false);
    expect(JSON.parse(init.body as string).website).toBe('bot');
  });

  it('T83 (CO-T48): 201 without body is sent; 200 and 204 are http-error', async () => {
    expect(await answer(reply(201))).toEqual({ kind: 'sent' });
    expect(await answer(reply(200))).toEqual({ kind: 'http-error', status: 200 });
    expect(await answer(new Response(null, { status: 204 }))).toEqual({ kind: 'http-error', status: 204 });
  });

  it('T83 (CO-T49): 400 CONTACT_INVALID extracts the field from the Spanish and English details, and leaves it out when unrecognisable', async () => {
    const send = (detail: string) => answer(reply(400, problem(400, 'CONTACT_INVALID', detail)));
    expect(await send('El campo «email» no es válido.')).toMatchObject({ kind: 'invalid', field: 'email' });
    expect(await send('The "email" field is not valid.')).toMatchObject({ kind: 'invalid', field: 'email' });
    const unknown = await send('Algo falló.');
    expect(unknown).toMatchObject({ kind: 'invalid', detail: 'Algo falló.' });
    expect('field' in unknown).toBe(false);
    expect('field' in (await send('El campo «website» no es válido.'))).toBe(false);
  });

  it('T83 (CO-T50): 429 CONTACT_RATE_LIMITED is rate-limited', async () => {
    expect(await answer(reply(429, problem(429, 'CONTACT_RATE_LIMITED')))).toEqual({ kind: 'rate-limited' });
  });

  it('T83 (CO-T51): 400 BAD_REQUEST, 500 UNEXPECTED and the proxy 502/504 problems keep their code and status', async () => {
    expect(await answer(reply(400, problem(400, 'BAD_REQUEST')))).toMatchObject({ kind: 'problem', code: 'BAD_REQUEST', status: 400 });
    expect(await answer(reply(500, problem(500, 'UNEXPECTED')))).toMatchObject({ kind: 'problem', code: 'UNEXPECTED', status: 500 });
    expect(await answer(reply(502, problem(502, 'CONTACT_UPSTREAM')))).toMatchObject({ kind: 'problem', code: 'CONTACT_UPSTREAM', status: 502 });
    expect(await answer(reply(504, problem(504, 'CONTACT_TIMEOUT')))).toMatchObject({ kind: 'problem', code: 'CONTACT_TIMEOUT', status: 504 });
  });

  it('T83 (CO-T52): 502 with HTML, 413 and 403 without body are http-error with the status', async () => {
    expect(await answer(reply(502, '<html>bad gateway</html>', 'text/html'))).toEqual({ kind: 'http-error', status: 502 });
    expect(await answer(reply(413))).toEqual({ kind: 'http-error', status: 413 });
    expect(await answer(reply(403))).toEqual({ kind: 'http-error', status: 403 });
  });

  it('T83 (CO-T53): a network failure is network and nothing is thrown', async () => {
    expect(await against(() => Promise.reject(new TypeError('fetch failed'))).result).toEqual({ kind: 'network' });
  });

  it('T83 (CO-T54): a server that never answers times out; a signal aborted by the caller is aborted', async () => {
    expect(await against(hang, { timeoutMs: 40 }).result).toEqual({ kind: 'timeout' });
    const controller = new AbortController();
    const pending = against(hang, { signal: controller.signal, timeoutMs: 5000 }).result;
    setTimeout(() => controller.abort(), 40);
    expect(await pending).toEqual({ kind: 'aborted' });
  });
});
