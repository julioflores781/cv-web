// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { getAdminContent, getVersion, listVersions, rollbackContent, saveAdminContent } from './content';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const base = () => ({ baseUrl: server?.url ?? '', token: 'jwt', retryDelayMs: 1 });
const lang = (version: number, content: Record<string, unknown> | null = { services: [] }) => ({ version, publishedAt: version ? '2026-11-10T18:02:11Z' : null, source: version ? 'admin' : null, comment: null, content: version ? content : null });
const body = (es: ReturnType<typeof lang>, en: ReturnType<typeof lang>, parity = { ok: true, differences: [] as unknown[] }) => ({ kind: 'services', languages: { es, en }, parity });
const bodyOf = (req: import('node:http').IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = '';
    req.on('data', (chunk: Buffer) => (text += chunk.toString()));
    req.on('end', () => resolve(text));
  });

describe('content operations', () => {
  it('T215: getAdminContent returns versions, the empty publication (version 0, content null) and a parity with differences; an unknown kind is refused before asking', async () => {
    const bodies = [
      body(lang(3), lang(3)),
      body(lang(0), lang(0)),
      body(lang(2), lang(1), { ok: false, differences: [{ path: 'services[0].price', code: 'PARITY_MISMATCH' }] }),
    ];
    let next = 0;
    server = await startServer((_req, res) => json(res, 200, bodies[next++]));
    const [full, empty, broken] = [await getAdminContent('services', base()), await getAdminContent('services', base()), await getAdminContent('services', base())];
    expect(full).toMatchObject({ kind: 'ok', data: { kind: 'services', languages: { es: { version: 3, content: { services: [] } }, en: { version: 3 } }, parity: { ok: true, differences: [] } } });
    expect(empty).toMatchObject({ kind: 'ok', data: { languages: { es: { version: 0, content: null, publishedAt: null }, en: { version: 0, content: null } } } });
    expect(broken).toMatchObject({ kind: 'ok', data: { parity: { ok: false, differences: [{ path: 'services[0].price', code: 'PARITY_MISMATCH' }] } } });

    const before = server.requests.length;
    for (const kind of ['resume', '../x', '', 'Services']) expect(await getAdminContent(kind, base())).toMatchObject({ kind: 'invalid', source: 'input' });
    expect(server.requests).toHaveLength(before);
    expect(server.requests[0]).toBe('/api/v1/admin/content/services');
  });

  it('T217: saveAdminContent sends exactly {baseVersions, comment?, documents} (no comment when empty) and maps 409, 422, 413', async () => {
    const answers = [
      { status: 200, body: body(lang(4), lang(4)) },
      { status: 409, body: { code: 'CONTENT_VERSION_CONFLICT' } },
      { status: 422, body: { code: 'CONTENT_INVALID', errors: [{ path: 'es.projects[1].client', code: 'ANONYMOUS_CLIENT_FORBIDDEN' }] } },
      { status: 422, body: { code: 'CONTENT_PARITY_BROKEN', errors: [{ path: 'services[0].price', code: 'PARITY_MISMATCH' }] } },
      { status: 413, body: { code: 'CONTENT_TOO_LARGE' } },
      { status: 200, body: body(lang(5), lang(5)) },
    ];
    let next = 0;
    const sent: string[] = [];
    server = await startServer(async (req, res) => {
      sent.push(await bodyOf(req));
      const answer = answers[next++] ?? { status: 500, body: {} };
      json(res, answer.status, answer.body, answer.status >= 400 ? 'application/problem+json' : 'application/json');
    });
    const documents = { es: { services: [{ id: 'web' }] }, en: { services: [{ id: 'web' }] } };
    const input = { baseVersions: { es: 3, en: 3 }, documents };
    const results = [
      await saveAdminContent('services', { ...input, comment: 'Cambio de precio' }, base()),
      await saveAdminContent('services', input, base()),
      await saveAdminContent('services', input, base()),
      await saveAdminContent('services', input, base()),
      await saveAdminContent('services', input, base()),
      await saveAdminContent('services', { ...input, comment: '   ' }, base()),
    ];
    expect(results.map((r) => (r.kind === 'problem' ? r.code : r.kind))).toEqual(['ok', 'CONTENT_VERSION_CONFLICT', 'CONTENT_INVALID', 'CONTENT_PARITY_BROKEN', 'CONTENT_TOO_LARGE', 'ok']);
    expect(results[2]).toMatchObject({ errors: [{ path: 'es.projects[1].client', code: 'ANONYMOUS_CLIENT_FORBIDDEN' }] });
    expect(JSON.parse(sent[0] ?? '')).toEqual({ baseVersions: { es: 3, en: 3 }, comment: 'Cambio de precio', documents });
    expect(Object.keys(JSON.parse(sent[5] ?? ''))).toEqual(['baseVersions', 'documents']);
    // A write is never retried: six calls, six requests, even after a 4xx or a 5xx.
    expect(server.requests).toHaveLength(6);
    expect(server.headers.every((headers) => headers['content-type'] === 'application/json')).toBe(true);
    expect(server.requests.every((url) => url === '/api/v1/admin/content/services')).toBe(true);

    for (const bad of [{ es: -1, en: 0 }, { es: 1.5, en: 0 }]) expect(await saveAdminContent('services', { ...input, baseVersions: bad }, base())).toMatchObject({ kind: 'invalid', source: 'input' });
    expect(await saveAdminContent('other', input, base())).toMatchObject({ kind: 'invalid', source: 'input' });
    expect(server.requests).toHaveLength(6);
  });

  it('T218: listVersions, getVersion and rollbackContent validate lang and integers first, parse the answers and map 404/409/422', async () => {
    server = await startServer(async (req, res) => {
      const text = await bodyOf(req);
      const route = `${req.method} ${req.url}`;
      if (route === 'GET /api/v1/admin/content/services/es/versions?limit=10') {
        return json(res, 200, { kind: 'services', lang: 'es', versions: [{ version: 5, active: false, publishedAt: '2026-11-10T18:02:11Z', source: 'admin', comment: 'x' }, { version: 4, active: true, publishedAt: '2026-11-09T18:02:11Z', source: 'seed', comment: null }] });
      }
      if (route === 'GET /api/v1/admin/content/services/es/versions/4') return json(res, 200, { kind: 'services', lang: 'es', version: 4, active: true, content: { services: [] } });
      if (route === 'GET /api/v1/admin/content/services/es/versions/99') return json(res, 404, { code: 'CONTENT_VERSION_NOT_FOUND' }, 'application/problem+json');
      if (route === 'POST /api/v1/admin/content/services/es/rollback') {
        const { baseVersion, targetVersion } = JSON.parse(text) as { baseVersion: number; targetVersion: number };
        if (baseVersion !== 5) return json(res, 409, { code: 'CONTENT_VERSION_CONFLICT' }, 'application/problem+json');
        if (targetVersion === 2) return json(res, 422, { code: 'CONTENT_INVALID', errors: [{ path: 'es.projects[0].images', code: 'IMAGES_NOT_ALLOWED_FOR_PROJECT' }] }, 'application/problem+json');
        if (targetVersion === 9) return json(res, 404, { code: 'CONTENT_VERSION_NOT_FOUND' }, 'application/problem+json');
        return json(res, 200, body(lang(3), lang(4)));
      }
      return json(res, 500, { code: 'UNEXPECTED' });
    });
    const list = await listVersions('services', 'es', base(), 10);
    expect(list).toMatchObject({ kind: 'ok', data: { kind: 'services', lang: 'es', versions: [{ version: 5, active: false, comment: 'x' }, { version: 4, active: true, comment: null, source: 'seed' }] } });
    expect(await getVersion('services', 'es', 4, base())).toMatchObject({ kind: 'ok', data: { version: 4, active: true, content: { services: [] } } });
    expect(await getVersion('services', 'es', 99, base())).toMatchObject({ kind: 'problem', status: 404, code: 'CONTENT_VERSION_NOT_FOUND' });
    expect(await rollbackContent('services', 'es', { baseVersion: 5, targetVersion: 3 }, base())).toMatchObject({ kind: 'ok', data: { kind: 'services' } });
    expect(await rollbackContent('services', 'es', { baseVersion: 4, targetVersion: 3 }, base())).toMatchObject({ kind: 'problem', status: 409 });
    expect(await rollbackContent('services', 'es', { baseVersion: 5, targetVersion: 2 }, base())).toMatchObject({ kind: 'problem', status: 422, errors: [{ code: 'IMAGES_NOT_ALLOWED_FOR_PROJECT' }] });
    expect(await rollbackContent('services', 'es', { baseVersion: 5, targetVersion: 9 }, base())).toMatchObject({ kind: 'problem', status: 404 });

    const before = server.requests.length;
    const refused = [
      await listVersions('services', 'fr', base()),
      await listVersions('nope', 'es', base()),
      await listVersions('services', 'es', base(), 0),
      await getVersion('services', 'es', 0, base()),
      await getVersion('services', 'es', 1.5, base()),
      await getVersion('services', '../en', 1, base()),
      await rollbackContent('services', 'es', { baseVersion: 1, targetVersion: 0 }, base()),
      await rollbackContent('services', 'xx', { baseVersion: 1, targetVersion: 1 }, base()),
    ];
    expect(refused.every((r) => r.kind === 'invalid' && r.source === 'input')).toBe(true);
    expect(server.requests).toHaveLength(before);
  });
});
