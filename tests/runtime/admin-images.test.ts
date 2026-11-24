// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { fakeImage } from '@/tests/helpers/admin-images';
import { BROWSER_IP, bootAdmin, COOKIE, loginToken, registerCleanups, send, type AdminRuntime } from '@/tests/helpers/admin-runtime';

registerCleanups();

const MiB = 1024 * 1024;
const BOUNDARY = '----navegadorRuntime';
const SECRET_NAME = 'captura-secreta-del-cliente.png';
const MARKER = 'CONTENIDO-PRIVADO-DE-LA-IMAGEN';

/** A browser-like multipart with one `file` part. The PNG carries a text marker in its padding, to prove no content reaches the logs. */
function multipart(size: number): { body: Buffer; file: Buffer } {
  const file = Buffer.from(fakeImage('png', size));
  Buffer.from(MARKER).copy(file, 64);
  const head = Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${SECRET_NAME}"\r\nContent-Type: image/png\r\n\r\n`);
  return { body: Buffer.concat([head, file, Buffer.from(`\r\n--${BOUNDARY}--\r\n`)]), file };
}

interface Raw {
  status: number;
  headers: http.IncomingHttpHeaders;
  json: Record<string, unknown>;
  /** Bytes of the body written when the answer arrived, and the total. */
  sent: number;
  total: number;
}

interface UploadOptions {
  /** Streams the body without `Content-Length`. */
  chunked?: boolean;
  /** A slow client: 64 KiB every 10 ms (about 6 MiB/s), and it stops writing as soon as the answer arrives. */
  paced?: boolean;
}

/**
 * POSTs to the standalone with node:http, with `Content-Length` or chunked, at full speed or paced. Records how much of the body was written
 * when the answer came: an early 413 must arrive long before a slow client finishes. Never hangs (30 s guard).
 */
function upload(runtime: AdminRuntime, token: string | null, body: Buffer, { chunked = false, paced = false }: UploadOptions = {}): Promise<Raw> {
  const url = new URL('/admin/api/images/', runtime.server.url);
  return new Promise((resolve, reject) => {
    let sent = 0;
    let answered = false;
    const request = http.request(
      url,
      {
        method: 'POST',
        headers: {
          origin: new URL(runtime.site).origin,
          ...(token === null ? {} : { cookie: `${COOKIE}=${token}` }),
          'cf-connecting-ip': BROWSER_IP,
          'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
          ...(chunked ? {} : { 'content-length': String(body.length) }),
        },
      },
      (response) => {
        answered = true;
        const at = sent;
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (text += chunk));
        response.on('end', () => {
          if (at < body.length) request.destroy();
          resolve({ status: response.statusCode ?? 0, headers: response.headers, json: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>), sent: at, total: body.length });
        });
      },
    );
    request.setTimeout(30_000, () => request.destroy(new Error('upload hung')));
    // The server may answer and close before the whole body is written: that is not a failure here.
    request.on('error', (error: NodeJS.ErrnoException) => (answered || error.code === 'EPIPE' || error.code === 'ECONNRESET' ? undefined : reject(error)));
    const chunk = 64 * 1024;
    const step = () => {
      while (!answered && sent < body.length) {
        const part = body.subarray(sent, sent + chunk);
        sent += part.length;
        const flushed = request.write(part);
        if (paced) {
          setTimeout(step, 10);
          return;
        }
        if (!flushed) {
          request.once('drain', step);
          return;
        }
      }
      if (!answered) request.end();
    };
    step();
  });
}

/** Log lines written after `from` (a length of `server.log()`); every one must be a JSON line. */
const linesAfter = (runtime: AdminRuntime, from: number) =>
  runtime.server
    .log()
    .slice(from)
    .split('\n')
    .filter((line) => line.trim() !== '');

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const storedHashes = (runtime: AdminRuntime) => [...(runtime.api.admin?.state.images.values() ?? [])].map((image) => image.sha256);

describe('admin images (standalone with proxy.ts + fake admin API)', () => {
  it('T388: 100 KB and exactly 5 MiB (with Content-Length) reach the fake whole (same hash); 5 MiB + 1, 6.5 MiB and 12 MiB are 413; for a slow client the 413 (and the 401 without a cookie) arrives long before it finishes sending, and Next writes no non-JSON line', async () => {
    const runtime = await bootAdmin();
    const token = await loginToken(runtime);
    for (const size of [100 * 1024, 5 * MiB]) {
      const { body, file } = multipart(size);
      const reply = await upload(runtime, token, body);
      expect(reply.status, String(size)).toBe(201);
      expect(reply.json).toMatchObject({ bytes: size, contentType: 'image/png' });
      expect(storedHashes(runtime)).toContain(sha(file));
    }
    const from = runtime.server.log().length;
    for (const size of [5 * MiB + 1, 6.5 * MiB]) {
      const reply = await upload(runtime, token, multipart(Math.floor(size)).body);
      expect(reply.status, String(size)).toBe(413);
      expect(reply.json).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    }
    // Bodies over the 10 MB a proxied request is buffered to, sent slowly: refused by Content-Length before the first MiB is out.
    for (const size of [12 * MiB, 24 * MiB]) {
      const reply = await upload(runtime, token, multipart(size).body, { paced: true });
      expect(reply.status, String(size)).toBe(413);
      expect(reply.json).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
      expect(reply.sent, String(size)).toBeLessThan(MiB);
    }
    // Without a cookie the handler itself answers 401 at once, with the panel's headers (the proxy does not run on this path).
    const anonymous = await upload(runtime, null, multipart(12 * MiB).body, { paced: true });
    expect(anonymous.status).toBe(401);
    expect(anonymous.json).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    expect(anonymous.sent).toBeLessThan(MiB);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    expect(anonymous.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(anonymous.headers['x-frame-options']).toBe('DENY');

    expect(runtime.api.admin?.state.images.size).toBe(2);
    const lines = linesAfter(runtime, from);
    expect(lines.filter((line) => !line.startsWith('{'))).toEqual([]);
    expect(runtime.server.log()).not.toContain('Request body exceeded');
    // The server is still fine after the refusals.
    expect((await send(runtime, '/admin/api/images/', { cookie: token })).status).toBe(200);
  }, 120_000);

  it('extra (matcher): the image handlers sit outside proxy.ts but keep the session, CSRF and the panel headers; the gallery page is still gated', async () => {
    const runtime = await bootAdmin();
    const id = '00000000-0000-4000-8000-000000000001';
    const replies = [
      await send(runtime, '/admin/api/images/'),
      await send(runtime, '/admin/api/images/cleanup/', { method: 'POST', body: {} }),
      await send(runtime, `/admin/api/images/${id}/`, { method: 'DELETE' }),
    ];
    for (const reply of replies) {
      expect(reply.status).toBe(401);
      expect(reply.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
      expect(reply.headers.get('cache-control')).toBe('no-store');
      expect(reply.headers.get('x-robots-tag')).toBe('noindex, nofollow');
      expect(reply.headers.get('x-frame-options')).toBe('DENY');
    }
    const token = await loginToken(runtime);
    const foreign = await send(runtime, '/admin/api/images/cleanup/', { method: 'POST', cookie: token, body: {}, headers: { origin: 'https://evil.example.test' } });
    expect(foreign.status).toBe(403);
    const page = await send(runtime, '/admin/images/');
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toContain('/admin/login/?next=');
    // No request reached the API without a session or from another site.
    expect(runtime.api.admin?.state.received.filter((request) => request.path.startsWith('/api/v1/admin/images'))).toEqual([]);
  }, 120_000);

  it('T389: a chunked upload without Content-Length of 3 MiB passes; of 8 MiB and 12 MiB, sent slowly, the 413 arrives once the cap is passed, before the end', async () => {
    const runtime = await bootAdmin();
    const token = await loginToken(runtime);
    const small = multipart(3 * MiB);
    const ok = await upload(runtime, token, small.body, { chunked: true });
    expect(ok.status).toBe(201);
    expect(storedHashes(runtime)).toEqual([sha(small.file)]);
    const from = runtime.server.log().length;
    for (const size of [8 * MiB, 12 * MiB]) {
      const big = await upload(runtime, token, multipart(size).body, { chunked: true, paced: true });
      expect(big.status, String(size)).toBe(413);
      expect(big.json).toMatchObject({ code: 'IMAGE_TOO_LARGE' });
      // Stopped right after the 5 MiB + 64 KiB cap (plus what was in flight), far from the whole body.
      expect(big.sent, String(size)).toBeLessThan(6 * MiB);
      expect(big.sent).toBeLessThan(big.total);
    }
    expect(runtime.api.admin?.state.images.size).toBe(1);
    expect(linesAfter(runtime, from).filter((line) => !line.startsWith('{'))).toEqual([]);
  }, 120_000);

  it('T390: with the storage down an upload is a 503 IMAGE_STORAGE_UNAVAILABLE and saving content still works', async () => {
    const runtime = await bootAdmin({ admin: { storage: false } });
    const token = await loginToken(runtime);
    const reply = await upload(runtime, token, multipart(10 * 1024).body);
    expect(reply.status).toBe(503);
    expect(reply.json).toMatchObject({ code: 'IMAGE_STORAGE_UNAVAILABLE' });
    const documents = {
      es: { services: [{ id: 'servicio-ejemplo', title: 'Servicio de ejemplo', summary: 'Un servicio ficticio.', price: null }] },
      en: { services: [{ id: 'servicio-ejemplo', title: 'Sample service', summary: 'A made-up service.', price: null }] },
    };
    const saved = await send(runtime, '/admin/api/content/services/', { method: 'PUT', cookie: token, body: { baseVersions: { es: 0, en: 0 }, documents } });
    expect(saved.status).toBe(200);
    expect((await send(runtime, '/')).text).toContain('Servicio de ejemplo');
  }, 120_000);

  it('T391: after uploading, the log has admin_image_upload with outcome and bytes only, never the file name nor its content', async () => {
    const runtime = await bootAdmin();
    const token = await loginToken(runtime);
    expect((await upload(runtime, token, multipart(20 * 1024).body)).status).toBe(201);
    expect((await upload(runtime, token, multipart(5 * MiB + 1).body)).status).toBe(413);
    const lines = runtime.server
      .log()
      .split('\n')
      .filter((line) => line.includes('"admin_image_upload"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ level: 'info', outcome: 'ok', status: 201, bytes: 20 * 1024, content_type: 'image/png' });
    expect(lines[1]).toMatchObject({ level: 'warn', outcome: 'too_large', status: 413 });
    for (const line of lines) {
      expect(Object.keys(line).every((key) => ['timestamp', 'level', 'service', 'event', 'request_id', 'outcome', 'status', 'bytes', 'content_type'].includes(key))).toBe(true);
    }
    const log = runtime.server.log();
    expect(log).not.toContain(SECRET_NAME);
    expect(log).not.toContain('captura-secreta');
    expect(log).not.toContain(MARKER);
    expect(log).not.toContain(token);
    expect(log).not.toContain(BROWSER_IP);
  }, 120_000);
});
