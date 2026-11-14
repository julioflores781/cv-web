import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminFetch, uploadImage } from './browser-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
function stub(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn((url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal('fetch', mock);
  return mock;
}
const callOf = (mock: ReturnType<typeof stub>) => mock.mock.calls[0] as [string, RequestInit];

describe('adminFetch', () => {
  it('T276: URLs end in a slash (before any query), same-origin credentials, JSON body, no cache; 2xx is ok with the data', async () => {
    const mock = stub(() => reply(200, { ok: true }));
    expect(await adminFetch('/admin/api/login', { json: { a: 1 } })).toEqual({ kind: 'ok', status: 200, data: { ok: true } });
    await adminFetch('/admin/api/content/services?x=1', { method: 'GET' });
    await adminFetch('/admin/api/logout/', { json: {} });
    expect(mock.mock.calls.map((call) => call[0])).toEqual(['/admin/api/login/', '/admin/api/content/services/?x=1', '/admin/api/logout/']);
    const [, init] = callOf(mock);
    expect(init.credentials).toBe('same-origin');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
    expect((mock.mock.calls[1] as [string, RequestInit])[1].body).toBeUndefined();
  });

  it('T276: classifies network, offline and timeout; a 401 ADMIN_UNAUTHORIZED is expired but another 401 is a problem', async () => {
    stub(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'network' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'offline' });

    stub((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    expect(await adminFetch('/admin/api/x/', { timeoutMs: 20 })).toEqual({ kind: 'timeout' });

    stub(() => reply(401, { code: 'ADMIN_UNAUTHORIZED', requestId: 'r1' }));
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'expired' });
    stub(() => reply(401, { code: 'ADMIN_INVALID_CREDENTIALS', requestId: 'r2' }));
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'problem', status: 401, code: 'ADMIN_INVALID_CREDENTIALS', requestId: 'r2' });
  });

  it('T276: problems carry code, requestId and retryAfterSeconds; a body that is not a problem becomes HTTP_<status>', async () => {
    stub(() => reply(429, { code: 'ADMIN_LOGIN_LOCKED', requestId: 'r3', retryAfterSeconds: 900 }));
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'problem', status: 429, code: 'ADMIN_LOGIN_LOCKED', requestId: 'r3', retryAfterSeconds: 900 });
    stub(() => Promise.resolve(new Response('<html>bad gateway</html>', { status: 502 })));
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'problem', status: 502, code: 'HTTP_502' });
    stub(() => Promise.resolve(new Response('plain', { status: 200 })));
    expect(await adminFetch('/admin/api/x/', {})).toEqual({ kind: 'problem', status: 200, code: 'ADMIN_BAD_RESPONSE' });
  });

  it('T367: uploadImage sends FormData with one «file» part and no Content-Type of its own, never retries, can be aborted and returns a typed result', async () => {
    const uploaded = { key: 'site/projects/00000000-0000-4000-8000-000000000001.png', url: 'https://media.example.test/x.png', contentType: 'image/png', bytes: 12, width: 1, height: 1 };
    const mock = stub(() => reply(201, uploaded));
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'mi foto.png', { type: 'image/png' });
    expect(await uploadImage(file)).toEqual({ kind: 'ok', status: 201, data: uploaded });
    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = callOf(mock);
    expect(url).toBe('/admin/api/images/');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    // The browser sets the multipart boundary itself: no header is forced.
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect([...body.keys()]).toEqual(['file']);
    expect(body.get('file')).toBeInstanceOf(File);

    // A refusal is a typed problem (no retry).
    const refused = stub(() => reply(415, { code: 'IMAGE_UNSUPPORTED_TYPE', requestId: 'r9' }));
    expect(await uploadImage(file)).toEqual({ kind: 'problem', status: 415, code: 'IMAGE_UNSUPPORTED_TYPE', requestId: 'r9' });
    expect(refused).toHaveBeenCalledTimes(1);
    const failing = stub(() => Promise.reject(new TypeError('Failed to fetch')));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    expect(await uploadImage(file)).toEqual({ kind: 'network' });
    expect(failing).toHaveBeenCalledTimes(1);

    // Aborting is told apart from a timeout or a network failure.
    stub((_url, init) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const controller = new AbortController();
    const pending = uploadImage(file, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ kind: 'aborted' });
  });
});
