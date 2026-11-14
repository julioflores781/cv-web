// @vitest-environment node
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { cleanupImages, deleteImage, listImages, uploadImage } from './images';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const ID = '9f1c2d7e-1111-4a2b-8c3d-aaaaaaaaaaaa';
const KEY = `site/projects/${ID}.webp`;
const base = () => ({ baseUrl: server?.url ?? '', token: 'jwt', retryDelayMs: 1 });

function bytesOf(size: number): Buffer {
  const out = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) out[i] = (i * 31 + 7) % 256;
  return out;
}

describe('images operations', () => {
  it('T219: uploadImage sends a fresh multipart with one file part, own boundary and fixed name; bytes are identical (sha256); 201 is parsed', async () => {
    const original = bytesOf(100 * 1024);
    let raw = Buffer.alloc(0);
    let contentType = '';
    server = await startServer((req, res) => {
      contentType = req.headers['content-type'] ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        raw = Buffer.concat(chunks);
        json(res, 201, { key: KEY, url: `https://media.example.test/${KEY}`, contentType: 'image/webp', bytes: original.length, width: 1280, height: 720 });
      });
    });
    const result = await uploadImage(original, base());
    expect(result).toMatchObject({ kind: 'ok', status: 201, data: { key: KEY, width: 1280, height: 720 } });

    const boundary = /^multipart\/form-data; boundary=(.+)$/.exec(contentType)?.[1] ?? '';
    expect(boundary).toMatch(/^----cvweb[0-9a-f]{32}$/);
    const text = raw.toString('latin1');
    expect(text.split(`--${boundary}`).length).toBe(3); // opening and closing delimiters around a single part
    expect(text).toContain('Content-Disposition: form-data; name="file"; filename="upload"');
    const start = raw.indexOf('\r\n\r\n') + 4;
    const end = raw.lastIndexOf(`\r\n--${boundary}--`);
    expect(createHash('sha256').update(raw.subarray(start, end)).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
    expect(server.headers[0]?.['content-length']).toBe(String(raw.length));
  });

  it('T219 (errors): 400, 413, 415 and 503 map to their IMAGE_* problems and an upload is never retried; empty or over-5-MiB input is not sent', async () => {
    const statuses = [[400, 'IMAGE_INVALID'], [413, 'IMAGE_TOO_LARGE'], [415, 'IMAGE_UNSUPPORTED_TYPE'], [503, 'IMAGE_STORAGE_UNAVAILABLE']] as const;
    let next = 0;
    server = await startServer((_req, res) => {
      const [status, code] = statuses[next++] ?? [500, 'X'];
      json(res, status, { code }, 'application/problem+json');
    });
    const results = [];
    for (let i = 0; i < statuses.length; i += 1) results.push(await uploadImage(bytesOf(10), base()));
    expect(results).toMatchObject(statuses.map(([status, code]) => ({ kind: 'problem', status, code })));
    expect(server.requests).toHaveLength(4);
    expect(await uploadImage(Buffer.alloc(0), base())).toMatchObject({ kind: 'invalid', source: 'input' });
    expect(await uploadImage(Buffer.alloc(5 * 1024 * 1024 + 1), base())).toMatchObject({ kind: 'invalid', source: 'input' });
    expect(server.requests).toHaveLength(4);
  });

  it('T220: listImages parses the five fields, deleteImage and cleanupImages validate ids and numbers first and map 204/404/409', async () => {
    server = await startServer((req, res) => {
      if (req.method === 'GET') return json(res, 200, { images: [{ key: KEY, url: `https://media.example.test/${KEY}`, bytes: 183422, lastModified: '2026-11-10T18:00:00Z', referenced: true, extra: 1 }] });
      if (req.method === 'DELETE') {
        if (req.url?.endsWith(ID)) {
          res.writeHead(204);
          return res.end();
        }
        return json(res, req.url?.endsWith('0000') ? 404 : 409, { code: req.url?.endsWith('0000') ? 'IMAGE_NOT_FOUND' : 'IMAGE_IN_USE' }, 'application/problem+json');
      }
      return json(res, 200, { dryRun: true, deleted: [], wouldDelete: [KEY], kept: 4 });
    });
    const listed = await listImages(base());
    expect(listed).toMatchObject({ kind: 'ok', data: [{ key: KEY, bytes: 183422, referenced: true }] });
    expect(JSON.stringify(listed)).not.toContain('"extra"');

    for (const bad of ['../etc/passwd', '', 'not-a-uuid', ID.toUpperCase(), `${ID}/x`]) expect(await deleteImage(bad, base())).toMatchObject({ kind: 'invalid', source: 'input' });
    expect(await deleteImage(ID, base())).toMatchObject({ kind: 'ok', status: 204 });
    expect(await deleteImage('11111111-1111-4111-8111-111111110000', base())).toMatchObject({ kind: 'problem', status: 404, code: 'IMAGE_NOT_FOUND' });
    expect(await deleteImage('11111111-1111-4111-8111-111111111111', base())).toMatchObject({ kind: 'problem', status: 409, code: 'IMAGE_IN_USE' });

    for (const bad of [{ dryRun: true, olderThanHours: 0 }, { dryRun: true, olderThanHours: 1.5 }, { dryRun: true, olderThanHours: -1 }, { dryRun: 'yes' as unknown as boolean, olderThanHours: 24 }]) {
      expect(await cleanupImages(bad, base())).toMatchObject({ kind: 'invalid', source: 'input' });
    }
    expect(await cleanupImages({ dryRun: true, olderThanHours: 24 }, base())).toMatchObject({ kind: 'ok', data: { dryRun: true, wouldDelete: [KEY], kept: 4 } });
    expect(server.requests.at(-1)).toBe('/api/v1/admin/images/cleanup?dryRun=true&olderThanHours=24');
    expect(server.requests.filter((url) => url.includes('..') || url.includes('passwd'))).toEqual([]);
  });
});
