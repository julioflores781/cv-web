// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { adminReq, freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import { sample } from '@/tests/helpers/admin-content';
import { captureLogs } from '@/tests/helpers/capture-log';
import { GET, POST } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

type Services = { services: Array<Record<string, unknown>> };
const SEED = { services: { es: sample('services.es'), en: sample('services.en') } };
const COMMENT = 'SENTINEL-comentario-del-guardado';
const TITLE = 'SENTINEL-titulo-v2';

/** The fake with services at v1 (seed) and v2 (a save with a comment) in both languages. */
async function boot() {
  const api = await startAdminApi({ seed: SEED });
  cleanups.push(api.restore);
  const token = await freshToken(api);
  const es = sample('services.es') as Services;
  es.services[0] = { ...es.services[0], title: TITLE };
  const state = api.admin?.state;
  for (const [lang, content] of [['es', es], ['en', sample('services.en')]] as const) {
    const slot = state?.content.get('services')?.[lang];
    slot?.versions.push({ version: 2, publishedAt: Date.now(), source: 'admin', comment: COMMENT, content });
    if (slot) slot.active = 2;
  }
  const rollbacks = () => (api.admin?.state.received ?? []).filter((entry) => entry.method === 'POST' && entry.path.endsWith('/rollback')).length;
  return { api, token, rollbacks };
}

const segment = (kind: string, lang: string) => ({ params: Promise.resolve({ kind, lang }) });
const post = (token: string, body: unknown, { kind = 'services', lang = 'es', origin, contentType }: { kind?: string; lang?: string; origin?: string | null; contentType?: string | null } = {}) =>
  POST(
    adminReq(`/admin/api/content/${kind}/${lang}/rollback/`, {
      cookie: token,
      body,
      ...(origin === undefined ? {} : { origin }),
      ...(contentType === undefined ? {} : { contentType }),
    }),
    segment(kind, lang),
  );

describe('POST /admin/api/content/[kind]/[lang]/rollback', () => {
  it('T396: kind, lang and both versions (whole numbers ≥1) are checked before any call; extra fields are dropped; CSRF and body type are enforced', async () => {
    const { token, rollbacks } = await boot();
    const invalid: Array<[unknown, { kind?: string; lang?: string }]> = [
      [{ baseVersion: 2, targetVersion: 1 }, { kind: 'resume' }],
      [{ baseVersion: 2, targetVersion: 1 }, { lang: 'fr' }],
      [{ baseVersion: 2, targetVersion: 1 }, { lang: '..' }],
      [{ baseVersion: 0, targetVersion: 1 }, {}],
      [{ baseVersion: 2, targetVersion: 0 }, {}],
      [{ baseVersion: 2, targetVersion: -1 }, {}],
      [{ baseVersion: 2, targetVersion: 1.5 }, {}],
      [{ baseVersion: '2', targetVersion: 1 }, {}],
      [{ baseVersion: 2 }, {}],
      [{ baseVersion: 2, targetVersion: 2_147_483_648 }, {}],
      ['[2, 1]', {}],
      ['no es json', {}],
    ];
    for (const [body, where] of invalid) {
      const response = await post(token, body, where);
      const expected = where.kind || where.lang ? 404 : 400;
      expect(response.status, JSON.stringify([body, where])).toBe(expected);
      expect(await response.json()).toMatchObject({ code: expected === 404 ? 'ADMIN_NOT_FOUND' : 'ADMIN_BAD_REQUEST' });
    }
    expect((await post(token, 'x'.repeat(5000))).status).toBe(413);
    // CSRF and body type: 403/415 with no call.
    expect((await post(token, { baseVersion: 2, targetVersion: 1 }, { origin: 'https://evil.example.test' })).status).toBe(403);
    expect((await post(token, { baseVersion: 2, targetVersion: 1 }, { origin: null })).status).toBe(403);
    expect((await post(token, { baseVersion: 2, targetVersion: 1 }, { contentType: 'text/plain' })).status).toBe(415);
    expect((await POST(adminReq('/admin/api/content/services/es/rollback/', { body: { baseVersion: 2, targetVersion: 1 } }), segment('services', 'es'))).status).toBe(401);
    expect(rollbacks()).toBe(0);

    // Unknown fields never reach the API: the fake, strict like `RollbackRequest`, would answer 400 to any of them.
    const done = await post(token, '{"baseVersion":2,"targetVersion":1,"comment":"x","__proto__":{"a":1},"force":true}');
    expect(done.status).toBe(200);
    expect(done.headers.get('cache-control')).toBe('no-store');
    expect(rollbacks()).toBe(1);
    const body = (await done.json()) as { languages: { es: { version: number }; en: { version: number } }; parity: { ok: boolean } };
    // Reactivated, not a new version: ES is at v1 again, EN did not move.
    expect(body.languages.es.version).toBe(1);
    expect(body.languages.en.version).toBe(2);
    expect((await GET()).status).toBe(405);
  });

  it('T397 (handler): a stale base is a 409 with the latest content read right away; a missing target is 404; a target that fails today’s rules is 422 with its errors; the API is called once', async () => {
    const { api, token, rollbacks } = await boot();
    const conflict = await post(token, { baseVersion: 1, targetVersion: 1 });
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as { code: string; requestId: string; latest: { languages: { es: { version: number } } } };
    expect(body.code).toBe('CONTENT_VERSION_CONFLICT');
    expect(body.requestId).toMatch(/^[0-9a-f]{32}$/);
    expect(body.latest.languages.es.version).toBe(2);

    const missing = await post(token, { baseVersion: 2, targetVersion: 9 });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'CONTENT_VERSION_NOT_FOUND' });

    // Version 3 (made up here) breaks today's rules: a service without a title.
    const slot = api.admin?.state.content.get('services')?.es;
    slot?.versions.push({ version: 3, publishedAt: Date.now(), source: 'admin', comment: null, content: { services: [{ id: 'roto', title: '', summary: 'x', price: null }] } });
    const invalid = await post(token, { baseVersion: 2, targetVersion: 3 });
    expect(invalid.status).toBe(422);
    const errors = (await invalid.json()) as { code: string; errors: Array<{ path: string; code: string }> };
    expect(errors.code).toBe('CONTENT_INVALID');
    expect(errors.errors).toContainEqual({ path: 'es.services[0].title', code: 'REQUIRED' });
    expect(slot?.active).toBe(2);

    // One call each: a rollback is never retried, even on a 500.
    api.admin?.inject('rollback', { mode: '500' });
    const down = await post(token, { baseVersion: 2, targetVersion: 1 });
    expect(down.status).toBe(502);
    expect(rollbacks()).toBe(4);
  });

  it('T399: admin_rollback logs kind, lang, outcome, from and to (and the request id) and nothing else: no comment, no content, no token', async () => {
    const { token } = await boot();
    const log = captureLogs();
    await post(token, { baseVersion: 1, targetVersion: 1 });
    await post(token, { baseVersion: 2, targetVersion: 1 });
    log.restore();
    const events = log.events('admin_rollback');
    expect(events.map(({ kind, lang, outcome, from, to }) => ({ kind, lang, outcome, from, to }))).toEqual([
      { kind: 'services', lang: 'es', outcome: 'conflict', from: 1, to: 1 },
      { kind: 'services', lang: 'es', outcome: 'ok', from: 2, to: 1 },
    ]);
    for (const entry of events) {
      expect(Object.keys(entry).sort()).toEqual(['event', 'from', 'kind', 'lang', 'level', 'outcome', 'request_id', 'service', 'timestamp', 'to']);
      expect(entry.request_id).toMatch(/^[0-9a-f]{32}$/);
    }
    for (const forbidden of [COMMENT, TITLE, token, '203.0.113.7']) expect(log.text(), forbidden).not.toContain(forbidden);
  });
});
