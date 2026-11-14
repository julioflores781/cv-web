// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { adminReq, freshToken, setCookies, startAdminApi } from '@/tests/helpers/admin-routes';
import { sample } from '@/tests/helpers/admin-content';
import { captureLogs } from '@/tests/helpers/capture-log';
import { GET, POST, PUT } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const SEED = { services: { es: sample('services.es'), en: sample('services.en') } };
const segment = (kind: string) => ({ params: Promise.resolve({ kind }) });

async function boot() {
  const api = await startAdminApi({ seed: SEED });
  cleanups.push(api.restore);
  const token = await freshToken(api);
  const puts = () => (api.admin?.state.received ?? []).filter((entry) => entry.method === 'PUT').length;
  return { api, token, puts };
}

const get = (token: string, kind = 'services') => GET(adminReq(`/admin/api/content/${kind}/`, { method: 'GET', cookie: token, contentType: null }), segment(kind));
const put = (token: string, body: unknown, kind = 'services') => PUT(adminReq(`/admin/api/content/${kind}/`, { method: 'PUT', cookie: token, body }), segment(kind));
const docs = (title = 'Servicio editado') => {
  const es = sample('services.es') as { services: Array<Record<string, unknown>> };
  es.services[0] = { ...es.services[0], title };
  return { es, en: sample('services.en') };
};

describe('/admin/api/content/[kind]', () => {
  it('T312: GET gives the API document with no-store; an unknown kind is 404 ADMIN_NOT_FOUND with no API call', async () => {
    const { api, token } = await boot();
    const response = await get(token);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = (await response.json()) as { kind: string; languages: { es: { version: number; content: unknown } }; parity: { ok: boolean } };
    expect(body.kind).toBe('services');
    expect(body.languages.es.version).toBe(1);
    expect(body.languages.es.content).toEqual(SEED.services.es);
    expect(body.parity.ok).toBe(true);
    const before = api.requests.length;
    const unknown = await get(token, 'resume');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: 'ADMIN_NOT_FOUND' });
    expect((await put(token, { baseVersions: { es: 1, en: 1 }, documents: docs() }, '__proto__')).status).toBe(404);
    expect(api.requests).toHaveLength(before);
    expect((await POST()).status).toBe(405);
  });

  it('extra (AC7): a PUT with a foreign Origin, cross-site Sec-Fetch-Site, no Origin or a non-JSON body is 403/415 with no API call', async () => {
    const { token, puts } = await boot();
    const body = { baseVersions: { es: 1, en: 1 }, documents: docs() };
    const send = (options: Parameters<typeof adminReq>[1]) => PUT(adminReq('/admin/api/content/services/', { method: 'PUT', cookie: token, body, ...options }), segment('services'));
    for (const options of [{ origin: 'https://evil.example' }, { headers: { 'sec-fetch-site': 'cross-site' } }, { origin: null }]) {
      const refused = await send(options);
      expect(refused.status, JSON.stringify(options)).toBe(403);
      expect(await refused.json()).toMatchObject({ code: 'ADMIN_CSRF' });
    }
    const text = await send({ contentType: 'text/plain' });
    expect(text.status).toBe(415);
    expect(await text.json()).toMatchObject({ code: 'ADMIN_UNSUPPORTED_MEDIA' });
    expect(puts()).toBe(0);
  });

  it('T313: a valid PUT forwards only baseVersions, comment and documents and returns what was saved; admin_content_save logs kind, outcome and versions', async () => {
    const { api, token } = await boot();
    const logs = captureLogs();
    try {
      const response = await put(token, { kind: 'projects', extra: 1, baseVersions: { es: 1, en: 1 }, comment: 'Ajuste de precios', documents: docs() });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { languages: { es: { version: number; content: { services: Array<{ title: string }> } }; en: { version: number } } };
      expect(body.languages.es.version).toBe(2);
      expect(body.languages.en.version).toBe(2);
      expect(body.languages.es.content.services[0]?.title).toBe('Servicio editado');
      expect(api.admin?.state.content.get('services')?.es.versions.at(-1)?.comment).toBe('Ajuste de precios');
      const events = logs.events('admin_content_save');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ kind: 'services', outcome: 'ok', status: 200, es_version: 2, en_version: 2, error_count: 0, request_id: response.headers.get('x-request-id') });
    } finally {
      logs.restore();
    }
  });

  it('T314: non-JSON bodies, bodies over 128 KB, non-integer baseVersions or non-object documents are refused without calling the API', async () => {
    const { token, puts } = await boot();
    for (const body of ['no json', [], {}, { baseVersions: { es: 1.5, en: 1 }, documents: docs() }, { baseVersions: { es: -1, en: 1 }, documents: docs() }, { baseVersions: { es: 1, en: 1 }, documents: [] }, { baseVersions: { es: 1, en: 1 }, documents: { es: {}, en: 'x' } }, { baseVersions: { es: 1, en: 1 }, documents: docs(), comment: 7 }]) {
      const response = await put(token, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_BAD_REQUEST' });
    }
    const huge = await put(token, { baseVersions: { es: 1, en: 1 }, documents: docs('x'.repeat(130 * 1024)) });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toMatchObject({ code: 'CONTENT_TOO_LARGE' });
    expect(puts()).toBe(0);
  });

  it('T315: an API 409 answers 409 with latest (read right after); if that read fails, 409 without latest', async () => {
    const { api, token } = await boot();
    const stale = await put(token, { baseVersions: { es: 0, en: 1 }, documents: docs() });
    expect(stale.status).toBe(409);
    const body = (await stale.json()) as { code: string; latest: { languages: { es: { version: number } } } };
    expect(body.code).toBe('CONTENT_VERSION_CONFLICT');
    expect(body.latest.languages.es.version).toBe(1);
    api.admin?.inject('content.get', { mode: '500' });
    const blind = await put(token, { baseVersions: { es: 0, en: 1 }, documents: docs() });
    expect(blind.status).toBe(409);
    const blindBody = (await blind.json()) as Record<string, unknown>;
    expect(blindBody.code).toBe('CONTENT_VERSION_CONFLICT');
    expect(blindBody).not.toHaveProperty('latest');
  });

  it('T316: an API 422 answers with errors (path and code only, at most 200); the log only has error_count', async () => {
    const { token } = await boot();
    const logs = captureLogs();
    try {
      const bad = { services: Array.from({ length: 30 }, (_, i) => ({ id: `S${i}`, title: '', summary: '' })) };
      const response = await put(token, { baseVersions: { es: 1, en: 1 }, comment: 'comentario secreto', documents: { es: bad, en: bad } });
      expect(response.status).toBe(422);
      const body = (await response.json()) as { code: string; errors: Array<Record<string, unknown>> };
      expect(body.code).toBe('CONTENT_INVALID');
      expect(body.errors).toHaveLength(180);
      expect(body.errors.every((entry) => Object.keys(entry).sort().join() === 'code,path')).toBe(true);
      const parity = await put(token, { baseVersions: { es: 1, en: 1 }, documents: { es: { services: [{ id: 'a', title: 'A', summary: 'S' }] }, en: { services: [] } } });
      expect(parity.status).toBe(422);
      expect(await parity.json()).toMatchObject({ code: 'CONTENT_PARITY_BROKEN', errors: [{ path: 'services[0]', code: 'PARITY_MISMATCH' }] });
      const [first] = logs.events('admin_content_save');
      expect(first).toMatchObject({ outcome: 'invalid', error_count: 180, status: 422 });
      expect(logs.text()).not.toMatch(/comentario secreto|S0|title|summary/);
    } finally {
      logs.restore();
    }
  });

  it('T317: an API 401 clears the cookie, a 413 is CONTENT_TOO_LARGE and a 5xx or a dead API is 502 without a retry', async () => {
    const { api, token, puts } = await boot();
    const expired = await put('fake.0.dead', { baseVersions: { es: 1, en: 1 }, documents: docs() });
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    expect(setCookies(expired).join()).toMatch(/Max-Age=0/);

    const big = { services: [{ id: 'a', title: 'T', summary: 'x'.repeat(100 * 1024) }] };
    const tooLarge = await put(token, { baseVersions: { es: 1, en: 1 }, documents: { es: big, en: big } });
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ code: 'CONTENT_TOO_LARGE' });

    api.admin?.inject('content.save', { mode: '500' });
    const before = puts();
    const broken = await put(token, { baseVersions: { es: 1, en: 1 }, documents: docs() });
    expect(broken.status).toBe(502);
    expect(await broken.json()).toMatchObject({ code: 'ADMIN_UPSTREAM' });
    expect(puts() - before).toBe(1);

    process.env.CV_API_URL = 'http://127.0.0.1:1';
    const dead = await put(token, { baseVersions: { es: 1, en: 1 }, documents: docs() });
    expect(dead.status).toBe(502);
  });

  it('T318: sending the same save twice: the first is saved, the second is a 409 conflict (with latest), never a second save', async () => {
    const { api, token } = await boot();
    const body = { baseVersions: { es: 1, en: 1 }, documents: docs() };
    const [first, second] = [await put(token, body), await put(token, body)];
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ code: 'CONTENT_VERSION_CONFLICT', latest: { languages: { es: { version: 2 } } } });
    expect(api.admin?.state.content.get('services')?.es.versions).toHaveLength(2);
  });
});
