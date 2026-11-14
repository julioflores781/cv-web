// @vitest-environment node
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closedPortUrl } from '@/tests/helpers/http-server';
import { adminReq, COOKIE, freshToken, setCookies, SITE, startAdminApi } from '@/tests/helpers/admin-routes';
import { fakeImage } from '@/tests/helpers/admin-images';
import { captureLogs } from '@/tests/helpers/capture-log';
import { UPLOAD_TIMEOUT_MS } from '@/lib/api/admin/client';
import { MAX_IMAGE_BYTES } from '@/lib/admin/images';
import { MAX_UPLOAD_BODY_BYTES } from '@/lib/admin/image-handler';
import { GET, POST } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const BOUNDARY = '----navegador123';
const SECRET_NAME = 'nombre-privado-del-cliente.png';
type Part = { name: string; filename?: string; type?: string; data: Uint8Array | string };

/** A multipart body as a browser frames it. */
function multipart(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = `form-data; name="${part.name}"${part.filename === undefined ? '' : `; filename="${part.filename}"`}`;
    chunks.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n${part.type ? `Content-Type: ${part.type}\r\n` : ''}\r\n`));
    chunks.push(typeof part.data === 'string' ? Buffer.from(part.data) : Buffer.from(part.data));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const filePart = (data: Uint8Array, filename = SECRET_NAME): Part => ({ name: 'file', filename, type: 'image/png', data });

interface UploadOptions {
  token?: string;
  /** `false` streams the body without `Content-Length` (chunked). A number is sent as the header, whatever the body is. */
  length?: number | false;
  contentType?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  /** Counts the chunks the handler pulled from the body. */
  onPull?: () => void;
}

function upload(body: Buffer, options: UploadOptions = {}): Promise<Response> {
  const { token, length = body.length, contentType = `multipart/form-data; boundary=${BOUNDARY}`, origin = SITE, headers = {} } = options;
  const chunk = 64 * 1024;
  let at = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      options.onPull?.();
      if (at >= body.length) return controller.close();
      controller.enqueue(new Uint8Array(body.subarray(at, at + chunk)));
      at += chunk;
    },
  }, { highWaterMark: 0 }); // nothing is pulled until the handler reads
  const all: Record<string, string> = {
    host: new URL(SITE).host,
    'cf-connecting-ip': '203.0.113.7',
    'content-type': contentType,
    ...(origin === null ? {} : { origin }),
    ...(token === undefined ? {} : { cookie: `${COOKIE}=${token}` }),
    ...(length === false ? {} : { 'content-length': String(length) }),
    ...headers,
  };
  // `duplex: 'half'` is what undici requires for a streamed request body.
  const init = { method: 'POST', headers: all, body: stream, duplex: 'half' as const };
  return POST(new NextRequest(`${SITE}/admin/api/images/`, init));
}

const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const uploads = (api: { admin: { state: { received: Array<{ method: string; path: string }> } } | undefined }) =>
  (api.admin?.state.received ?? []).filter((request) => request.method === 'POST' && request.path === '/api/v1/admin/images').length;

async function setup(options: Parameters<typeof startAdminApi>[0] = {}) {
  const api = await startAdminApi(options);
  cleanups.push(api.restore);
  return { api, token: await freshToken(api) };
}

describe('POST /admin/api/images (upload)', () => {
  it('T368: a 100 KB PNG reaches the API as one «file» part with the same bytes and no name or header of the browser; 201 with the six fields; the log has outcome and bytes only', async () => {
    const { api, token } = await setup();
    const log = captureLogs();
    const image = fakeImage('png', 100 * 1024, 1280, 720);
    const response = await upload(multipart([filePart(image)]), { token });
    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['bytes', 'contentType', 'height', 'key', 'url', 'width']);
    expect(body).toMatchObject({ contentType: 'image/png', bytes: image.byteLength, width: 1280, height: 720 });
    expect(body.key).toMatch(/^site\/projects\/[0-9a-f-]{36}\.png$/);

    const stored = [...(api.admin?.state.images.values() ?? [])];
    expect(stored).toHaveLength(1);
    expect(stored[0]?.sha256).toBe(sha(image));
    expect(stored[0]?.fileName).toBe('upload');
    const received = api.admin?.state.received.find((request) => request.path === '/api/v1/admin/images');
    expect(String(received?.headers['content-type'])).toMatch(/^multipart\/form-data; boundary=----cvweb[0-9a-f]{32}$/);
    expect(received?.headers['x-client-ip']).toBe('203.0.113.7');
    expect(Object.keys(received?.headers ?? {}).filter((name) => name.startsWith('cf-') || name === 'cookie' || name === 'origin')).toEqual([]);

    const lines = log.events('admin_image_upload');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: 'info', outcome: 'ok', status: 201, bytes: image.byteLength, content_type: 'image/png' });
    expect(log.text()).not.toContain(SECRET_NAME);
    expect(log.text()).not.toContain('nombre-privado');
    log.restore();
  });

  it('T369: a Content-Length over 5 MiB + 64 KiB is a 413 without reading the body and without calling the API; chunked over the cap stops reading at the cap; right at the limit it passes', async () => {
    const { api, token } = await setup();
    expect(MAX_UPLOAD_BODY_BYTES).toBe(MAX_IMAGE_BYTES + 64 * 1024);
    let pulls = 0;
    const big = await upload(Buffer.alloc(16), { token, length: MAX_UPLOAD_BODY_BYTES + 1, onPull: () => (pulls += 1) });
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(pulls).toBe(0);

    const huge = multipart([filePart(fakeImage('png', 8 * 1024 * 1024))]);
    pulls = 0;
    const chunked = await upload(huge, { token, length: false, onPull: () => (pulls += 1) });
    expect(chunked.status).toBe(413);
    expect(await chunked.json()).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    // It gave up once the count passed the cap (64 KiB chunks), far before the 8 MiB.
    expect(pulls * 64 * 1024).toBeLessThan(MAX_UPLOAD_BODY_BYTES + 3 * 64 * 1024);
    expect(uploads(api)).toBe(0);

    const exact = multipart([filePart(fakeImage('png', MAX_IMAGE_BYTES))]);
    expect(exact.length).toBeLessThanOrEqual(MAX_UPLOAD_BODY_BYTES);
    expect((await upload(exact, { token })).status).toBe(201);
    expect((await upload(exact, { token, length: false })).status).toBe(201);
    expect(uploads(api)).toBe(2);
  }, 30_000);

  it('T370: not multipart, no file, two files, another part name or an empty file are 400 IMAGE_INVALID with no call; a file over 5 MiB inside the body cap is the handler’s own 413', async () => {
    const { api, token } = await setup();
    const png = fakeImage('png', 1024);
    const cases: Array<[string, Buffer, string?]> = [
      ['broken multipart', Buffer.from('esto no es multipart')],
      ['no parts', Buffer.from(`--${BOUNDARY}--\r\n`)],
      ['only a text field', multipart([{ name: 'file', data: 'texto' }])],
      ['two files', multipart([filePart(png), filePart(png, 'b.png')])],
      ['file plus a field', multipart([filePart(png), { name: 'alt', data: 'x' }])],
      ['another name', multipart([{ ...filePart(png), name: 'image' }])],
      ['empty file', multipart([filePart(new Uint8Array(0))])],
      ['boundary missing', multipart([filePart(png)]), 'multipart/form-data'],
    ];
    for (const [label, body, contentType] of cases) {
      const response = await upload(body, { token, ...(contentType ? { contentType } : {}) });
      expect(response.status, label).toBe(400);
      expect(await response.json(), label).toMatchObject({ code: 'IMAGE_INVALID' });
    }
    const over = await upload(multipart([filePart(fakeImage('png', MAX_IMAGE_BYTES + 1))]), { token });
    expect(over.status).toBe(413);
    expect(await over.json()).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    // Bytes that are not an accepted image never travel either: another image type is 415, anything else 400 (as the API splits them).
    const svg = await upload(multipart([filePart(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))]), { token });
    expect(svg.status).toBe(415);
    expect(await svg.json()).toMatchObject({ code: 'IMAGE_UNSUPPORTED_TYPE' });
    const html = await upload(multipart([filePart(new TextEncoder().encode('<!doctype html><title>x</title>'), 'foto.jpg')]), { token });
    expect(html.status).toBe(400);
    expect(uploads(api)).toBe(0);
  });

  it('T371: the API’s 400/413/415/503 pass with their code; a 401 clears the cookie; an API that is down is 502', async () => {
    const { api, token } = await setup();
    const png = multipart([filePart(fakeImage('png', 2048))]);
    const answers: Array<[number, string]> = [[400, 'IMAGE_INVALID'], [413, 'IMAGE_TOO_LARGE'], [415, 'IMAGE_UNSUPPORTED_TYPE'], [503, 'IMAGE_STORAGE_UNAVAILABLE']];
    for (const [status, code] of answers) {
      const original = api.admin?.handle;
      // The fake answers what the API would; each refusal is produced by a one-off override of its upload route.
      vi.spyOn(api.admin as NonNullable<typeof api.admin>, 'handle').mockImplementationOnce(async (req, res) => {
        if (req.url?.startsWith('/api/v1/admin/images') !== true) return (original as NonNullable<typeof original>)(req, res);
        req.resume();
        await new Promise((resolve) => req.on('end', resolve));
        res.writeHead(status, { 'Content-Type': 'application/problem+json' });
        res.end(JSON.stringify({ status, code, title: 'x' }));
        return true;
      });
      const response = await upload(png, { token });
      expect(response.status, code).toBe(status);
      expect(await response.json()).toMatchObject({ code });
    }
    // Each one was a single request: uploads are never retried.
    api.admin?.setStorage(false);
    const before = api.requests.length;
    expect((await upload(png, { token })).status).toBe(503);
    expect(api.requests.length - before).toBe(1);
    api.admin?.setStorage(true);

    const expired = await upload(png, { token: 'fake.0.muerto' });
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    expect(setCookies(expired)[0]).toMatch(new RegExp(`^${COOKIE}=;.*Max-Age=0`));

    process.env.CV_API_URL = await closedPortUrl();
    const down = await upload(png, { token });
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ code: 'ADMIN_UPSTREAM' });
  });

  it('T371: an API that never answers is a 504 ADMIN_TIMEOUT after 30 s (fake clock)', async () => {
    const { api, token } = await setup();
    expect(UPLOAD_TIMEOUT_MS).toBe(30_000);
    api.admin?.inject('images.upload', { mode: 'silence' });
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      let settled = false;
      const pending = upload(multipart([filePart(fakeImage('png', 2048))]), { token }).finally(() => (settled = true));
      // The timer of the call starts once the request reached the API (body read and checked first).
      while (uploads(api) === 0) await new Promise((resolve) => setImmediate(resolve));
      await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_TIMEOUT' });
      expect(uploads(api)).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('T372: a foreign Origin or Sec-Fetch-Site: cross-site is a 403 with no call; the multipart is accepted with the site’s own Origin', async () => {
    const { api, token } = await setup();
    const png = multipart([filePart(fakeImage('png', 2048))]);
    for (const options of [{ origin: 'https://evil.example.test' }, { headers: { 'sec-fetch-site': 'cross-site' } }, { origin: null }] as UploadOptions[]) {
      const response = await upload(png, { token, ...options });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_CSRF' });
    }
    const json = await upload(Buffer.from('{}'), { token, contentType: 'application/json' });
    expect(json.status).toBe(415);
    expect(uploads(api)).toBe(0);
    expect((await upload(png, { token })).status).toBe(201);
  });
});

describe('GET /admin/api/images', () => {
  it('T373: returns the parsed list and passes the 503 IMAGE_STORAGE_UNAVAILABLE', async () => {
    const { api, token } = await setup();
    await upload(multipart([filePart(fakeImage('webp', 4096, 800, 600))]), { token });
    const response = await GET(adminReq('/admin/api/images/', { method: 'GET', cookie: token, contentType: null }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const { images } = (await response.json()) as { images: Array<Record<string, unknown>> };
    expect(images).toHaveLength(1);
    expect(Object.keys(images[0] ?? {}).sort()).toEqual(['bytes', 'key', 'lastModified', 'referenced', 'url']);
    expect(images[0]).toMatchObject({ bytes: 4096, referenced: false });

    api.admin?.setStorage(false);
    const down = await GET(adminReq('/admin/api/images/', { method: 'GET', cookie: token, contentType: null }));
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ code: 'IMAGE_STORAGE_UNAVAILABLE' });
  });
});
