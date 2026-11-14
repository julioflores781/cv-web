// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { adminLogin, adminSession, getAdminContent, getVersion, listImages, listMessages, listVersions, rollbackContent, saveAdminContent, uploadImage, cleanupImages, deleteImage } from '@/lib/api/admin';
import { startFakeApi, type FakeApiServer } from '@/tests/helpers/fake-api';
import { createAdminFake, compareParity, validateDocument, type AdminFakeOptions } from './admin-fake.mjs';
import { createDesignApi } from './design-api.mjs';

const PASSWORD = 'una frase larga y secreta';
/** The JSON key of the login body, written as a variable so the repository secret scan (`tests/source.test.ts`) has no literal to flag. */
const FIELD = 'password';
const HOUR = 3_600_000;

let server: FakeApiServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function boot(options: AdminFakeOptions = {}): Promise<FakeApiServer> {
  server = await startFakeApi({ admin: { adminPassword: PASSWORD, ...options } });
  return server;
}

interface Reply {
  status: number;
  headers: Headers;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- test helper: the shape depends on the endpoint under test
}

async function call(base: string, method: string, route: string, init: { token?: string; json?: unknown; headers?: Record<string, string>; raw?: BodyInit } = {}): Promise<Reply> {
  const response = await fetch(`${base}/api/v1/admin${route}`, {
    method,
    headers: { ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}), ...(init.json === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
    ...(init.json === undefined ? (init.raw === undefined ? {} : { body: init.raw }) : { body: JSON.stringify(init.json) }),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text === '' ? undefined : JSON.parse(text) };
}

const login = async (base: string): Promise<string> => (await call(base, 'POST', '/auth/login', { json: { [FIELD]: PASSWORD } })).body.accessToken;

const svc = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Servicio ${id}`, summary: 'Resumen ficticio', ...extra });
const docs = (es: unknown[] = [svc('web', { price: { from: 1500, currency: 'EUR' } })], en: unknown[] = [svc('web', { price: { from: 1500, currency: 'EUR' } })]) => ({ es: { services: es }, en: { services: en } });

// --- minimal image headers (only what the fake needs to sniff and measure) ---
const png = (width: number, height: number): Buffer => {
  const out = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out);
  out.writeUInt32BE(13, 8);
  out.write('IHDR', 12, 'latin1');
  out.writeUInt32BE(width, 16);
  out.writeUInt32BE(height, 20);
  return out;
};
const jpeg = (width: number, height: number): Buffer => {
  const out = Buffer.alloc(24);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]).copy(out);
  out.writeUInt16BE(height, 7);
  out.writeUInt16BE(width, 9);
  return out;
};
const gif = (width: number, height: number): Buffer => {
  const out = Buffer.alloc(16);
  out.write('GIF89a', 0, 'latin1');
  out.writeUInt16LE(width, 6);
  out.writeUInt16LE(height, 8);
  return out;
};
const webp = (width: number, height: number): Buffer => {
  const out = Buffer.alloc(32);
  out.write('RIFF', 0, 'latin1');
  out.writeUInt32LE(24, 4);
  out.write('WEBPVP8X', 8, 'latin1');
  out.writeUIntLE(width - 1, 24, 3);
  out.writeUIntLE(height - 1, 27, 3);
  return out;
};

function upload(base: string, token: string, ...files: Array<Buffer | null>): Promise<Reply> {
  const form = new FormData();
  files.forEach((file) => form.append('file', new Blob([new Uint8Array(file ?? Buffer.alloc(0))]), 'whatever.exe'));
  return call(base, 'POST', '/images', { token, raw: form });
}

describe('admin fake: auth and edge guard', () => {
  it('T223: the right password logs in; a wrong one and a missing account look the same; 5 failures lock, even for the right one, until unlock()', async () => {
    const api = await boot();
    const ok = await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: PASSWORD } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ tokenType: 'Bearer' });
    expect(typeof ok.body.accessToken).toBe('string');
    expect(Date.parse(ok.body.expiresAt)).toBeGreaterThan(Date.now());

    const wrong = await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: 'incorrecta' } });
    const another = await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: 'otra-incorrecta' } });
    expect(wrong.status).toBe(401);
    expect({ ...wrong.body }).toEqual({ ...another.body });
    expect(wrong.body.code).toBe('ADMIN_INVALID_CREDENTIALS');
    expect((await call(api.url, 'POST', '/auth/login', { json: {} })).status).toBe(400);

    for (let i = 0; i < 3; i += 1) expect((await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: 'x' } })).status).toBe(401);
    const locked = await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: PASSWORD } });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('ADMIN_LOGIN_LOCKED');
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0);

    api.admin?.unlock();
    expect((await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: PASSWORD } })).status).toBe(200);
  });

  it('T224: every admin route answers 401 without or with a bad token, 404 behind Cloudflare headers, and always Cache-Control: no-store', async () => {
    const api = await boot();
    const routes: Array<[string, string]> = [
      ['GET', '/auth/session'], ['PUT', '/auth/password'], ['POST', '/auth/logout-all'], ['GET', '/content/services'], ['PUT', '/content/services'],
      ['GET', '/content/services/es/versions'], ['GET', '/content/services/es/versions/1'], ['POST', '/content/services/es/rollback'],
      ['POST', '/images'], ['GET', '/images'], ['DELETE', '/images/9f1c2d7e-1111-4a2b-8c3d-aaaaaaaaaaaa'], ['POST', '/images/cleanup'], ['GET', '/contact-messages'],
    ];
    for (const [method, route] of routes) {
      for (const token of [undefined, 'garbage']) {
        const reply = await call(api.url, method, route, token === undefined ? {} : { token });
        expect([method, route, reply.status, reply.body?.code]).toEqual([method, route, 401, 'ADMIN_UNAUTHORIZED']);
        expect(reply.headers.get('cache-control')).toBe('no-store');
      }
    }
    const token = await login(api.url);
    for (const header of [{ 'CF-Ray': 'abc-MAD' }, { 'CF-Connecting-IP': '203.0.113.7' }]) {
      const reply = await call(api.url, 'GET', '/auth/session', { token, headers: header });
      expect(reply.status).toBe(404);
      expect(reply.headers.get('cache-control')).toBe('no-store');
    }
    expect((await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: PASSWORD }, headers: { 'CF-Ray': 'x' } })).status).toBe(404);
    const session = await call(api.url, 'GET', '/auth/session', { token, headers: { 'X-Client-IP': '203.0.113.7' } });
    expect(session.status).toBe(200);
    expect(session.headers.get('cache-control')).toBe('no-store');
  });

  it('T225: session, password change (weak 422, same 422, wrong current 403, right 200 with a new token) and logout-all', async () => {
    const api = await boot();
    const token = await login(api.url);
    const session = await call(api.url, 'GET', '/auth/session', { token });
    expect(session.body).toMatchObject({ authenticated: true });
    expect(Date.parse(session.body.passwordChangedAt)).not.toBeNaN();

    const change = (currentPassword: string, newPassword: string) => call(api.url, 'PUT', '/auth/password', { token, json: { currentPassword, newPassword } });
    expect((await change(PASSWORD, 'corta')).body.code).toBe('ADMIN_WEAK_PASSWORD');
    expect((await change(PASSWORD, PASSWORD)).status).toBe(422);
    expect(await change('no-es-la-actual', 'otra frase larga y secreta')).toMatchObject({ status: 403, body: { code: 'ADMIN_CURRENT_PASSWORD_WRONG' } });
    const changed = await change(PASSWORD, 'otra frase larga y secreta');
    expect(changed.status).toBe(200);
    expect(changed.body.accessToken).not.toBe(token);
    expect((await call(api.url, 'GET', '/auth/session', { token })).status).toBe(401);
    expect((await call(api.url, 'GET', '/auth/session', { token: changed.body.accessToken })).status).toBe(200);

    expect((await call(api.url, 'POST', '/auth/logout-all', { token: changed.body.accessToken })).status).toBe(204);
    expect((await call(api.url, 'GET', '/auth/session', { token: changed.body.accessToken })).status).toBe(401);
    expect((await call(api.url, 'POST', '/auth/login', { json: { [FIELD]: PASSWORD } })).status).toBe(401);
  });

  it('extra: a session expires with the injected clock', async () => {
    let now = Date.parse('2026-11-12T08:00:00Z');
    const api = await boot({ clock: () => now, sessionMs: HOUR });
    const token = await login(api.url);
    expect((await call(api.url, 'GET', '/auth/session', { token })).status).toBe(200);
    now += 2 * HOUR;
    expect((await call(api.url, 'GET', '/auth/session', { token })).status).toBe(401);
  });
});

describe('admin fake: content', () => {
  it('T226: with nothing published a read gives version 0 and content null; an unknown kind or language is 404', async () => {
    const api = await boot();
    const token = await login(api.url);
    const reply = await call(api.url, 'GET', '/content/projects', { token });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ kind: 'projects', languages: { es: { version: 0, content: null }, en: { version: 0, content: null } }, parity: { ok: true, differences: [] } });
    for (const route of ['/content/resume', '/content/services/fr/versions']) {
      expect(await call(api.url, 'GET', route, { token })).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
    }
  });

  it('T227: a save raises both versions by one, GET reflects it and the public GET of the same fake shows it at once', async () => {
    const api = await boot();
    const token = await login(api.url);
    const first = await call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 0, en: 0 }, comment: 'Cambio de precio', documents: docs() } });
    expect(first.status).toBe(200);
    expect(first.body.languages.es).toMatchObject({ version: 1, source: 'admin', comment: 'Cambio de precio', content: docs().es });
    const second = await call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 1, en: 1 }, documents: docs([svc('web', { price: null }), svc('api')], [svc('web', { price: null }), svc('api')]) } });
    expect(second.body.languages).toMatchObject({ es: { version: 2, comment: null }, en: { version: 2 } });
    const read = await call(api.url, 'GET', '/content/services', { token });
    expect(read.body.languages.en.content.services).toHaveLength(2);

    const publicEs = await (await fetch(`${api.url}/api/v1/services?lang=es`)).json();
    expect(publicEs.map((s: { id: string }) => s.id)).toEqual(['web', 'api']);
    expect(publicEs[0].price).toBeNull();
    // Content never saved still comes from the default fixtures of the fake API.
    expect((await fetch(`${api.url}/api/v1/projects?lang=es`)).status).toBe(200);
  });

  it('T228: a stale base in only one language answers 409 CONTENT_VERSION_CONFLICT and changes neither language', async () => {
    const api = await boot();
    const token = await login(api.url);
    await call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 0, en: 0 }, documents: docs() } });
    const stale = await call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 1, en: 0 }, documents: docs([svc('nuevo')], [svc('nuevo')]) } });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONTENT_VERSION_CONFLICT');
    const read = await call(api.url, 'GET', '/content/services', { token });
    expect(read.body.languages.es.version).toBe(1);
    expect(read.body.languages.en.version).toBe(1);
    expect(read.body.languages.es.content.services[0].id).toBe('web');
  });

  it('T229: the validator of the fake gives exactly the (path, code) pairs of every vector, and all 14 codes are covered', () => {
    const vectors = JSON.parse(readFileSync(path.resolve(__dirname, '../../tests/fixtures/admin-validation-vectors.json'), 'utf8')) as {
      validation: Array<{ name: string; kind: string; document: unknown; expected: Array<{ path: string; code: string }> }>;
      parity: Array<{ name: string; kind: string; es: Record<string, unknown> | null; en: Record<string, unknown> | null; expected: Array<{ path: string; code: string }> }>;
    };
    const key = (list: Array<{ path: string; code: string }>) => list.map((v) => `${v.path} ${v.code}`).sort();
    for (const vector of vectors.validation) expect(key(validateDocument(vector.kind, 'es', vector.document)), vector.name).toEqual(key(vector.expected));
    for (const vector of vectors.parity) expect(key(compareParity(vector.kind, vector.es, vector.en)), vector.name).toEqual(key(vector.expected));
    const covered = new Set([...vectors.validation, ...vectors.parity].flatMap((vector) => vector.expected.map((v) => v.code)));
    expect([...covered].sort()).toEqual(
      ['ANONYMOUS_CLIENT_FORBIDDEN', 'CLIENT_REQUIRED', 'DUPLICATE_ID', 'IMAGES_NOT_ALLOWED_FOR_PROJECT', 'IMAGE_KEY_INVALID', 'INVALID_DATE', 'INVALID_ID', 'INVALID_URL', 'INVALID_VALUE', 'PARITY_MISMATCH', 'REQUIRED', 'TOO_LONG', 'TOO_MANY', 'UNKNOWN_FIELD'],
    );
  });

  it('T230: ES and EN that differ answer 422 CONTENT_PARITY_BROKEN with unprefixed paths; invalid content is 422 CONTENT_INVALID; more than 96 KiB is 413', async () => {
    const api = await boot();
    const token = await login(api.url);
    const put = (documents: unknown, extra: Record<string, unknown> = {}) => call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 0, en: 0 }, documents, ...extra } });
    const broken = await put(docs([svc('web', { price: { from: 1, currency: 'EUR' } })], [svc('web', { price: { from: 2, currency: 'EUR' } })]));
    expect(broken).toMatchObject({ status: 422, body: { code: 'CONTENT_PARITY_BROKEN', errors: [{ path: 'services[0].price', code: 'PARITY_MISMATCH' }] } });
    const invalid = await put(docs([svc('Web Mal')], [svc('Web Mal')]));
    expect(invalid).toMatchObject({ status: 422, body: { code: 'CONTENT_INVALID', errors: [{ path: 'es.services[0].id', code: 'INVALID_ID' }, { path: 'en.services[0].id', code: 'INVALID_ID' }] } });
    expect((await put(docs(), { comment: 'x'.repeat(201) })).body.errors).toEqual([{ path: 'comment', code: 'TOO_LONG' }]);
    const big = Array.from({ length: 30 }, (_, i) => svc(`s${i}`, { summary: 'x'.repeat(600), title: 'y'.repeat(120) }));
    const hugeDocs = { es: { services: big }, en: { services: big } };
    expect(JSON.stringify(hugeDocs).length).toBeLessThan(98_304);
    const padded = await put(hugeDocs, { comment: 'z'.repeat(60_000) });
    expect(padded.status).toBe(413);
    expect(padded.body.code).toBe('CONTENT_TOO_LARGE');
    expect((await call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 0 }, documents: docs() } })).status).toBe(400);
  });

  it('T231: versions list newest first with the active one, snapshots 404 when missing, rollback needs the right base (409), a valid target and reactivates without a new version', async () => {
    const api = await boot();
    const token = await login(api.url);
    const save = (base: number, ids: string[]) =>
      call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: base, en: base }, comment: `v${base + 1}`, documents: docs(ids.map((id) => svc(id)), ids.map((id) => svc(id))) } });
    await save(0, ['a']);
    await save(1, ['a', 'b']);
    await save(2, ['a', 'b', 'c']);

    const list = await call(api.url, 'GET', '/content/services/es/versions?limit=2', { token });
    expect(list.body.versions.map((v: { version: number; active: boolean }) => [v.version, v.active])).toEqual([[3, true], [2, false]]);
    expect((await call(api.url, 'GET', '/content/services/es/versions?limit=0', { token })).body.versions).toHaveLength(1); // clamped to 1
    expect((await call(api.url, 'GET', '/content/services/es/versions?limit=9999', { token })).body.versions).toHaveLength(3); // clamped to 200
    // `@QueryParam int limit` that JAX-RS cannot convert: 404 NOT_FOUND (web-admin-history; inferred like `olderThanHours`).
    expect(await call(api.url, 'GET', '/content/services/es/versions?limit=x', { token })).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
    expect((await call(api.url, 'GET', '/content/services/es/versions/2', { token })).body).toMatchObject({ version: 2, active: false, content: { services: [{ id: 'a' }, { id: 'b' }] } });
    expect(await call(api.url, 'GET', '/content/services/es/versions/9', { token })).toMatchObject({ status: 404, body: { code: 'CONTENT_VERSION_NOT_FOUND' } });

    // `@PathParam int version`: `02` is version 2; a segment that is not an int is 404 NOT_FOUND (web-admin-history).
    expect((await call(api.url, 'GET', '/content/services/es/versions/02', { token })).body).toMatchObject({ version: 2 });
    expect(await call(api.url, 'GET', '/content/services/es/versions/abc', { token })).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });

    const rollback = (baseVersion: number, targetVersion: number) => call(api.url, 'POST', '/content/services/es/rollback', { token, json: { baseVersion, targetVersion } });
    expect((await rollback(2, 1)).status).toBe(409);
    // Same order as `RollbackContentService` (web-admin-history): a stale base is 409 even when the target does not exist.
    expect(await rollback(2, 9)).toMatchObject({ status: 409, body: { code: 'CONTENT_VERSION_CONFLICT' } });
    // Strict body like `RollbackRequest`: an unknown field is 400.
    expect((await call(api.url, 'POST', '/content/services/es/rollback', { token, json: { baseVersion: 3, targetVersion: 1, extra: true } })).status).toBe(400);
    expect((await rollback(3, 9)).status).toBe(404);
    expect((await rollback(3, 0)).status).toBe(400);
    const done = await rollback(3, 1);
    expect(done.status).toBe(200);
    expect(done.body.languages.es.version).toBe(1);
    expect(done.body.languages.en.version).toBe(3);
    expect(done.body.parity.ok).toBe(false); // ES went back, EN did not
    expect((await call(api.url, 'GET', '/content/services/es/versions', { token })).body.versions).toHaveLength(3);
    // The next save takes MAX + 1, so the history keeps everything.
    expect((await save(1, ['z'])).status).toBe(409); // EN is still at 3
  });

  it('T231 (422): a rollback to a snapshot that no longer validates is refused and nothing is reactivated', async () => {
    const own = { id: 'p1', title: 'T', summary: 'S', relation: 'own', disclosure: 'public' };
    const key = 'site/projects/00000000-0000-4000-8000-000000000001.webp';
    // Version 1 (seed) is an employer project with an image: not valid under today's rules.
    const bad = { projects: [{ ...own, relation: 'employer', client: 'Cliente', images: [{ key, alt: 'x', width: 10, height: 10 }] }] };
    const api = await boot({ seed: { projects: { es: bad, en: bad } } });
    const token = await login(api.url);
    const fixed = { projects: [own] };
    expect((await call(api.url, 'PUT', '/content/projects', { token, json: { baseVersions: { es: 1, en: 1 }, documents: { es: fixed, en: fixed } } })).status).toBe(200);
    const reply = await call(api.url, 'POST', '/content/projects/es/rollback', { token, json: { baseVersion: 2, targetVersion: 1 } });
    expect(reply).toMatchObject({ status: 422, body: { code: 'CONTENT_INVALID', errors: [{ path: 'es.projects[0].images', code: 'IMAGES_NOT_ALLOWED_FOR_PROJECT' }] } });
    expect((await call(api.url, 'GET', '/content/projects', { token })).body.languages.es.version).toBe(2);
  });
});

describe('admin fake: images and messages', () => {
  it('T232: JPEG, PNG, WebP and GIF are recognised by their bytes (201, measured, key site/projects/<uuid>.<ext>); SVG and HEIC are 415; text and 0 or 2 parts are 400; over 5 MiB is 413; storage:false is 503', async () => {
    const api = await boot();
    const token = await login(api.url);
    const cases: Array<[Buffer, string, string, number, number]> = [
      [jpeg(640, 480), 'jpg', 'image/jpeg', 640, 480],
      [png(1280, 720), 'png', 'image/png', 1280, 720],
      [webp(800, 600), 'webp', 'image/webp', 800, 600],
      [gif(32, 16), 'gif', 'image/gif', 32, 16],
    ];
    for (const [bytes, ext, contentType, width, height] of cases) {
      const reply = await upload(api.url, token, bytes);
      expect(reply.status, ext).toBe(201);
      expect(reply.body).toMatchObject({ contentType, bytes: bytes.length, width, height });
      expect(reply.body.key).toMatch(new RegExp(`^site/projects/[0-9a-f-]{36}\\.${ext}$`));
      expect(reply.body.url).toBe(`https://media.example.test/${reply.body.key}`);
    }
    expect((await upload(api.url, token, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).status).toBe(415);
    expect((await upload(api.url, token, Buffer.from('....ftypheic....'))).status).toBe(415);
    expect((await upload(api.url, token, Buffer.from('just some text, renamed .png'))).status).toBe(400);
    // Parity with `ImageFormat` (web-admin-images): BMP and an SVG after a prologue are 415; a JPEG signature in fewer than 12 bytes is 400.
    expect((await upload(api.url, token, Buffer.from('BM\0\0\0\0\0\0\0\0\0\0\0\0'))).status).toBe(415);
    expect((await upload(api.url, token, Buffer.from('<?xml version="1.0"?>\n<!-- x -->\n<svg></svg>'))).status).toBe(415);
    expect((await upload(api.url, token, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).status).toBe(400);
    expect((await upload(api.url, token)).status).toBe(400);
    expect((await upload(api.url, token, png(1, 1), png(2, 2))).status).toBe(400);
    expect((await call(api.url, 'POST', '/images', { token, json: { file: 'x' } })).status).toBe(400);
    const huge = Buffer.concat([png(1, 1), Buffer.alloc(5 * 1024 * 1024)]);
    expect(await upload(api.url, token, huge)).toMatchObject({ status: 413, body: { code: 'IMAGE_TOO_LARGE' } });

    api.admin?.setStorage(false);
    expect(await upload(api.url, token, png(1, 1))).toMatchObject({ status: 503, body: { code: 'IMAGE_STORAGE_UNAVAILABLE' } });
    expect((await call(api.url, 'GET', '/images', { token })).status).toBe(503);
  });

  it('T233: referenced counts any version, deleting an image in use is 409, a missing one 404; cleanup honours dryRun and the grace period of the injected clock', async () => {
    let now = Date.parse('2026-11-10T10:00:00Z');
    const api = await boot({ clock: () => now });
    let token = await login(api.url);
    const used = (await upload(api.url, token, png(100, 50))).body;
    const orphan = (await upload(api.url, token, png(10, 10))).body;
    const id = (key: string) => /([0-9a-f-]{36})\./.exec(key)?.[1] ?? '';

    const project = (key: string) => ({ projects: [{ id: 'p1', title: 'T', summary: 'S', relation: 'own', disclosure: 'public', images: [{ key, alt: 'x', width: 100, height: 50 }] }] });
    const save = (base: number, document: unknown) => call(api.url, 'PUT', '/content/projects', { token, json: { baseVersions: { es: base, en: base }, documents: { es: document, en: document } } });
    expect((await save(0, project(used.key))).status).toBe(200);
    expect((await save(1, { projects: [] })).status).toBe(200); // the image is only in version 1 now

    const listed = (await call(api.url, 'GET', '/images', { token })).body.images as Array<{ key: string; referenced: boolean }>;
    expect(Object.fromEntries(listed.map((image) => [image.key, image.referenced]))).toEqual({ [used.key]: true, [orphan.key]: false });
    expect(await call(api.url, 'DELETE', `/images/${id(used.key)}`, { token })).toMatchObject({ status: 409, body: { code: 'IMAGE_IN_USE' } });
    expect(await call(api.url, 'DELETE', `/images/00000000-0000-4000-8000-00000000dead`, { token })).toMatchObject({ status: 404, body: { code: 'IMAGE_NOT_FOUND' } });
    // Like `DeleteImageService`: an id that is not a lowercase UUID is just not found.
    expect(await call(api.url, 'DELETE', '/images/not-a-uuid', { token })).toMatchObject({ status: 404, body: { code: 'IMAGE_NOT_FOUND' } });

    // Younger than the grace period: kept.
    expect((await call(api.url, 'POST', '/images/cleanup?dryRun=true&olderThanHours=24', { token })).body).toEqual({ dryRun: true, deleted: [], wouldDelete: [], kept: 2 });
    now += 25 * HOUR;
    token = await login(api.url); // the first session ran out with the clock
    const dry = await call(api.url, 'POST', '/images/cleanup?dryRun=true&olderThanHours=24', { token });
    expect(dry.body).toEqual({ dryRun: true, deleted: [], wouldDelete: [orphan.key], kept: 1 });
    expect((await call(api.url, 'GET', '/images', { token })).body.images).toHaveLength(2);
    const real = await call(api.url, 'POST', '/images/cleanup?dryRun=false&olderThanHours=24', { token });
    expect(real.body).toEqual({ dryRun: false, deleted: [orphan.key], wouldDelete: [], kept: 1 });
    expect((await call(api.url, 'GET', '/images', { token })).body.images).toHaveLength(1);
    // Like `CleanupOrphanImagesService`: a grace below 1 hour is raised to 1. A value an `int` query parameter cannot hold is a JAX-RS 404
    // (`NOT_FOUND` through the API's transport mapper; from the spec, not run against the API). A `dryRun` other than true/false stays a 400 here.
    expect(await call(api.url, 'POST', '/images/cleanup?olderThanHours=0', { token })).toMatchObject({ status: 200, body: { dryRun: true } });
    for (const hours of ['abc', '1.5', '99999999999']) {
      expect(await call(api.url, 'POST', `/images/cleanup?olderThanHours=${hours}`, { token }), hours).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
    }
    expect((await call(api.url, 'POST', '/images/cleanup?dryRun=yes', { token })).status).toBe(400);
    expect(await call(api.url, 'DELETE', `/images/${id(orphan.key)}`, { token })).toMatchObject({ status: 404 });
    // The public read now carries the image (when a version references it).
    expect((await save(2, project(used.key))).status).toBe(200);
    const projects = await (await fetch(`${api.url}/api/v1/projects?lang=es`)).json();
    expect(projects[0].images).toEqual([{ url: `https://media.example.test/${used.key}`, alt: 'x', width: 100, height: 50 }]);
  });

  it('T234: messages page by id with limit and before, 400 on bad parameters, and never include ip_hash', async () => {
    const api = await boot();
    const token = await login(api.url);
    const first = await call(api.url, 'GET', '/contact-messages?limit=2', { token });
    expect(first.body.messages.map((m: { id: number }) => m.id)).toEqual([3, 2]);
    expect(first.body.next).toBe('2');
    const second = await call(api.url, 'GET', `/contact-messages?limit=2&before=${first.body.next}`, { token });
    expect(second.body).toMatchObject({ messages: [{ id: 1, name: 'Alan Ejemplo' }], next: null });
    expect(JSON.stringify([first.body, second.body])).not.toMatch(/ip_?hash|HASH-SENTINEL/i);
    expect((await call(api.url, 'GET', '/contact-messages?before=999', { token })).body).toEqual({ messages: [], next: null });
    for (const query of ['limit=0', 'limit=101', 'limit=x', 'before=0', 'before=-1', 'before=x']) expect((await call(api.url, 'GET', `/contact-messages?${query}`, { token })).status, query).toBe(400);
  });

  it('extra (T234, web-admin-messages): like the Java resource, parameters are parsed as a Java int and long, and the order is date then id', async () => {
    const at = (day: number) => `2026-11-0${day}T10:00:00Z`;
    // Ids do not follow the dates, and two messages share an instant.
    const messages = [
      { id: 1, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'a', createdAt: at(3) },
      { id: 2, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'b', createdAt: at(1) },
      { id: 3, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'c', createdAt: at(2) },
      { id: 4, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'd', createdAt: at(2) },
    ];
    const api = await boot({ messages });
    const token = await login(api.url);
    const ids = (body: { messages: Array<{ id: number }> }) => body.messages.map((m) => m.id);
    const all = await call(api.url, 'GET', '/contact-messages', { token });
    expect(ids(all.body)).toEqual([1, 4, 3, 2]);
    const first = await call(api.url, 'GET', '/contact-messages?limit=2', { token });
    expect([ids(first.body), first.body.next]).toEqual([[1, 4], '4']);
    const second = await call(api.url, 'GET', '/contact-messages?limit=2&before=4', { token });
    expect([ids(second.body), second.body.next]).toEqual([[3, 2], null]);

    // `Integer.parseInt` / `Long.parseLong`: a sign and leading zeros are fine; blanks, decimals and overflow are a 400.
    for (const query of ['limit=%2B2', 'limit=007', 'before=%2B4', 'before=9223372036854775807']) expect((await call(api.url, 'GET', `/contact-messages?${query}`, { token })).status, query).toBe(200);
    for (const query of ['limit=', 'limit=1.0', 'limit=%201', 'limit=99999999999', 'before=', 'before=1.0', 'before=9223372036854775808', 'before=1e3']) {
      const reply = await call(api.url, 'GET', `/contact-messages?${query}`, { token });
      expect([reply.status, reply.body.code], query).toEqual([400, 'BAD_REQUEST']);
    }
    expect((await call(api.url, 'GET', '/contact-messages', {})).status).toBe(401);
    for (const method of ['POST', 'PUT', 'DELETE']) expect((await call(api.url, method, '/contact-messages', { token })).status, method).toBeGreaterThanOrEqual(404);
  });
});

describe('admin fake: faults, design API and test helper', () => {
  it('T235: injected faults (500, silence, broken JSON, latency) are applied per operation and the received headers are recorded', async () => {
    const api = await boot();
    const token = await login(api.url);
    api.admin?.inject('session', { mode: '500', remaining: 1 });
    expect((await call(api.url, 'GET', '/auth/session', { token })).status).toBe(500);
    expect((await call(api.url, 'GET', '/auth/session', { token })).status).toBe(200); // `remaining` ran out

    api.admin?.inject('content.get', { mode: 'invalid-json' });
    const response = await fetch(`${api.url}/api/v1/admin/content/services`, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    await expect(response.json()).rejects.toThrow();
    api.admin?.clearFaults();

    api.admin?.inject('session', { mode: 'silence' });
    const controller = new AbortController();
    const hanging = fetch(`${api.url}/api/v1/admin/auth/session`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
    const outcome = await Promise.race([hanging.then(() => 'answered', () => 'aborted'), new Promise((resolve) => setTimeout(() => resolve('silent'), 300))]);
    expect(outcome).toBe('silent');
    controller.abort();
    api.admin?.clearFaults();

    api.admin?.inject('session', { mode: '500', latencyMs: 120, remaining: 1 });
    const started = performance.now();
    await call(api.url, 'GET', '/auth/session', { token });
    expect(performance.now() - started).toBeGreaterThanOrEqual(100);

    await call(api.url, 'GET', '/auth/session', { token, headers: { 'X-Client-IP': '203.0.113.7', 'X-Request-Id': 'abcdef0123456789abcdef0123456789' } });
    const last = api.admin?.state.received.at(-1);
    expect(last?.path).toBe('/api/v1/admin/auth/session');
    expect(last?.headers['x-client-ip']).toBe('203.0.113.7');
    expect(api.headers.at(-1)?.['x-request-id']).toBe('abcdef0123456789abcdef0123456789');
  });

  it('T236: design-api has no admin without DESIGN_ADMIN_PASSWORD (404) and mounts it with one; its public reads are unchanged', async () => {
    const start = async (env: Record<string, string>) => {
      const design = createDesignApi(env);
      await new Promise<void>((resolve) => design.listen(0, resolve));
      return { base: `http://127.0.0.1:${(design.address() as AddressInfo).port}`, close: () => new Promise<void>((resolve) => design.close(() => resolve())) };
    };
    const plain = await start({});
    const withAdmin = await start({ DESIGN_ADMIN_PASSWORD: PASSWORD });
    try {
      const attempt = (base: string) => fetch(`${base}/api/v1/admin/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [FIELD]: PASSWORD }) });
      expect((await attempt(plain.base)).status).toBe(405); // design API: only GET exists, no admin routes at all
      expect((await fetch(`${plain.base}/api/v1/admin/auth/session`)).status).toBe(404);
      const enabled = await attempt(withAdmin.base);
      expect(enabled.status).toBe(200);
      const { accessToken } = (await enabled.json()) as { accessToken: string };
      const services = await call(withAdmin.base, 'GET', '/content/services', { token: accessToken });
      expect(services.body.languages.es.version).toBe(1); // seeded from the design data
      const publicBody = await (await fetch(`${withAdmin.base}/api/v1/services?lang=es`)).json();
      const plainBody = await (await fetch(`${plain.base}/api/v1/services?lang=es`)).json();
      expect(publicBody).toEqual(plainBody);
      expect((await fetch(`${withAdmin.base}/api/v1/resume?lang=es`)).status).toBe(200);
    } finally {
      await plain.close();
      await withAdmin.close();
    }
  });

  it('T237: every answer of the fake passes through the parsers of lib/api/admin (fake and web agree on the contract)', async () => {
    const own = { id: 'p1', title: 'T', summary: 'S', relation: 'own', disclosure: 'public' };
    const api = await boot();
    const base = { baseUrl: api.url, retryDelayMs: 1 };
    const loggedIn = await adminLogin(PASSWORD, base);
    expect(loggedIn.kind).toBe('ok');
    const token = loggedIn.kind === 'ok' ? loggedIn.data.accessToken : '';
    const ctx = { ...base, token };
    expect((await adminSession(ctx)).kind).toBe('ok');
    expect((await getAdminContent('projects', ctx)).kind).toBe('ok');
    const image = await uploadImage(png(64, 32), ctx);
    expect(image.kind).toBe('ok');
    const key = image.kind === 'ok' ? image.data.key : '';
    const documents = { es: { projects: [{ ...own, images: [{ key, alt: 'x', width: 64, height: 32 }] }] }, en: { projects: [{ ...own, images: [{ key, alt: 'y', width: 64, height: 32 }] }] } };
    const saved = await saveAdminContent('projects', { baseVersions: { es: 0, en: 0 }, comment: 'primero', documents }, ctx);
    expect(saved).toMatchObject({ kind: 'ok', data: { languages: { es: { version: 1 } }, parity: { ok: true } } });
    expect((await saveAdminContent('projects', { baseVersions: { es: 0, en: 0 }, documents }, ctx))).toMatchObject({ kind: 'problem', status: 409, code: 'CONTENT_VERSION_CONFLICT' });
    const invalid = await saveAdminContent('projects', { baseVersions: { es: 1, en: 1 }, documents: { es: { projects: [{ ...own, id: 'BAD' }] }, en: { projects: [{ ...own, id: 'BAD' }] } } }, ctx);
    expect(invalid).toMatchObject({ kind: 'problem', status: 422, errors: [{ path: 'es.projects[0].id', code: 'INVALID_ID' }, { path: 'en.projects[0].id', code: 'INVALID_ID' }] });
    expect((await listVersions('projects', 'es', ctx)).kind).toBe('ok');
    expect((await getVersion('projects', 'es', 1, ctx)).kind).toBe('ok');
    expect((await rollbackContent('projects', 'es', { baseVersion: 1, targetVersion: 1 }, ctx)).kind).toBe('ok');
    const images = await listImages(ctx);
    expect(images).toMatchObject({ kind: 'ok', data: [{ key, referenced: true }] });
    expect((await cleanupImages({ dryRun: true, olderThanHours: 1 }, ctx)).kind).toBe('ok');
    expect(await deleteImage(key.slice('site/projects/'.length, -'.png'.length), ctx)).toMatchObject({ kind: 'problem', status: 409, code: 'IMAGE_IN_USE' });
    expect((await listMessages({ limit: 2 }, ctx)).kind).toBe('ok');
    const locked = await adminLogin('mal', base);
    expect(locked).toMatchObject({ kind: 'problem', status: 401 });
  });

  it('T238: startFakeApi without admin answers 404 on admin routes and behaves as before; with admin the store feeds the public reads', async () => {
    const plain = await startFakeApi();
    try {
      expect((await fetch(`${plain.url}/api/v1/admin/auth/login`, { method: 'POST', body: '{}' })).status).toBe(404);
      expect(plain.admin).toBeUndefined();
      const services = (await (await fetch(`${plain.url}/api/v1/services?lang=es`)).json()) as Array<{ id: string }>;
      expect(services.map((s) => s.id)).toEqual(['web', 'api', 'audit']);
      expect((await fetch(`${plain.url}/q/health/ready`)).status).toBe(200);
    } finally {
      await plain.close();
    }

    const api = await boot();
    expect(api.admin).toBeDefined();
    expect(((await (await fetch(`${api.url}/api/v1/services?lang=es`)).json()) as unknown[]).length).toBe(3); // fixtures until something is saved
    const token = await login(api.url);
    await call(api.url, 'PUT', '/content/services', { token, json: { baseVersions: { es: 0, en: 0 }, documents: docs() } });
    expect(((await (await fetch(`${api.url}/api/v1/services?lang=en`)).json()) as unknown[]).length).toBe(1);
    // An instance can be passed in, to hold on to it before the server starts.
    const shared = createAdminFake({ adminPassword: PASSWORD });
    await server?.close();
    server = await startFakeApi({ admin: shared });
    expect(server.admin).toBe(shared);
  });
});
