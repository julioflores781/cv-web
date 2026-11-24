// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bootAdmin, loginToken, registerCleanups, send } from '@/tests/helpers/admin-runtime';

registerCleanups();

const service = (title: string) => ({ services: [{ id: 'servicio-ejemplo', title, summary: 'Un servicio ficticio.', price: { from: 1500, currency: 'EUR' } }] });
const SEED = { services: { es: service('Servicio de ejemplo'), en: service('Sample service') } };

describe('admin history (standalone + fake admin API)', () => {
  it('T400: restoring an earlier version brings the public site back to it at once; the history page lists both versions; the log keeps no comment', async () => {
    const runtime = await bootAdmin({ admin: { seed: SEED } });
    const token = await loginToken(runtime);
    const comment = 'SENTINEL-comentario-historial';
    const saved = await send(runtime, '/admin/api/content/services/', {
      method: 'PUT',
      cookie: token,
      body: { baseVersions: { es: 1, en: 1 }, comment, documents: { es: service('Servicio renovado'), en: service('Renewed service') } },
    });
    expect(saved.status).toBe(200);
    expect((await send(runtime, '/')).text).toContain('Servicio renovado');

    const page = await send(runtime, '/admin/history/services/?lang=es', { cookie: token });
    expect(page.status).toBe(200);
    expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(page.text).toContain('Historial de servicios');
    expect(page.text).toContain('Restaurar la versión 1 (ES)');
    expect(page.text).toContain(comment);
    // An unknown kind has no route: a real 404 (not a 200 streamed before a late notFound()).
    expect((await send(runtime, '/admin/history/resume/', { cookie: token })).status).toBe(404);

    for (const lang of ['es', 'en']) {
      const restored = await send(runtime, `/admin/api/content/services/${lang}/rollback/`, { method: 'POST', cookie: token, body: { baseVersion: 2, targetVersion: 1 } });
      expect(restored.status, lang).toBe(200);
      expect(restored.headers.get('cache-control')).toBe('no-store');
    }
    const es = await send(runtime, '/');
    const en = await send(runtime, '/en/');
    expect(es.text).toContain('Servicio de ejemplo');
    expect(es.text).not.toContain('Servicio renovado');
    expect(en.text).toContain('Sample service');
    expect(en.text).not.toContain('Renewed service');

    // The history keeps both versions: a second rollback with the old base is a 409 and v2 can be reactivated.
    expect((await send(runtime, '/admin/api/content/services/es/rollback/', { method: 'POST', cookie: token, body: { baseVersion: 2, targetVersion: 2 } })).status).toBe(409);
    expect((await send(runtime, '/admin/api/content/services/es/rollback/', { method: 'POST', cookie: token, body: { baseVersion: 1, targetVersion: 2 } })).status).toBe(200);
    expect((await send(runtime, '/')).text).toContain('Servicio renovado');

    const log = runtime.server.log();
    const events = log
      .split('\n')
      .filter((line) => line.includes('"event":"admin_rollback"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map(({ lang, outcome, from, to }) => [lang, outcome, from, to])).toEqual([
      ['es', 'ok', 2, 1],
      ['en', 'ok', 2, 1],
      ['es', 'conflict', 2, 2],
      ['es', 'ok', 1, 2],
    ]);
    for (const forbidden of [comment, token, 'Servicio renovado']) expect(log, forbidden).not.toContain(forbidden);
  }, 120_000);
});
