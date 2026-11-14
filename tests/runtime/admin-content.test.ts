// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { bootAdmin, loginToken, registerCleanups, send, type AdminRuntime } from '@/tests/helpers/admin-runtime';

registerCleanups();

const SEED = {
  services: {
    es: { services: [{ id: 'servicio-ejemplo', title: 'Servicio de ejemplo', summary: 'Un servicio ficticio.', price: { from: 1500, currency: 'EUR' } }] },
    en: { services: [{ id: 'servicio-ejemplo', title: 'Sample service', summary: 'A made-up service.', price: { from: 1500, currency: 'EUR' } }] },
  },
};
const docs = (es: string, en: string, summary = 'Resumen ficticio del panel') => ({
  es: { services: [{ id: 'servicio-ejemplo', title: es, summary, price: { from: 1800, currency: 'EUR' } }] },
  en: { services: [{ id: 'servicio-ejemplo', title: en, summary: 'Made-up summary from the panel', price: { from: 1800, currency: 'EUR' } }] },
});
const save = (runtime: AdminRuntime, token: string, body: unknown) => send(runtime, '/admin/api/content/services/', { method: 'PUT', cookie: token, body });

describe('admin content (standalone + fake admin API)', () => {
  it('T339: a service edited through the handlers shows at once on /servicios/ and /en/services/, with no rebuild', async () => {
    const runtime = await bootAdmin({ admin: { seed: SEED } });
    const token = await loginToken(runtime);
    const before = await send(runtime, '/servicios/');
    expect(before.text).toContain('Servicio de ejemplo');
    const current = await send(runtime, '/admin/api/content/services/', { cookie: token });
    expect(current.status).toBe(200);
    const versions = (current.json() as { languages: { es: { version: number }; en: { version: number } } }).languages;
    const saved = await save(runtime, token, { baseVersions: { es: versions.es.version, en: versions.en.version }, comment: 'Precio nuevo', documents: docs('Servicio renovado', 'Renewed service') });
    expect(saved.status).toBe(200);
    expect(saved.headers.get('cache-control')).toBe('no-store');
    const es = await send(runtime, '/servicios/');
    const en = await send(runtime, '/en/services/');
    expect(es.text).toContain('Servicio renovado');
    expect(es.text).not.toContain('Servicio de ejemplo');
    expect(en.text).toContain('Renewed service');
    // The editor page itself renders the saved content for the next visit.
    const editor = await send(runtime, '/admin/services/', { cookie: token });
    expect(editor.status).toBe(200);
    expect(editor.text).toContain('Servicio renovado');
  }, 120_000);

  it('T340: a concurrent change makes the save a 409 with latest, and the public site keeps the other session’s version', async () => {
    const runtime = await bootAdmin({ admin: { seed: SEED } });
    const mine = await loginToken(runtime);
    const theirs = await loginToken(runtime);
    expect((await save(runtime, theirs, { baseVersions: { es: 1, en: 1 }, documents: docs('Cambio de la otra sesión', 'Other session change') })).status).toBe(200);
    const conflict = await save(runtime, mine, { baseVersions: { es: 1, en: 1 }, documents: docs('Mi cambio', 'My change') });
    expect(conflict.status).toBe(409);
    const body = conflict.json() as { code: string; latest: { languages: { es: { version: number; content: { services: Array<{ title: string }> } } } } };
    expect(body.code).toBe('CONTENT_VERSION_CONFLICT');
    expect(body.latest.languages.es.version).toBe(2);
    expect(body.latest.languages.es.content.services[0]?.title).toBe('Cambio de la otra sesión');
    const page = await send(runtime, '/servicios/');
    expect(page.text).toContain('Cambio de la otra sesión');
    expect(page.text).not.toContain('Mi cambio');
  }, 120_000);

  it('T341: after saving, the log has admin_content_save without titles, summaries nor the comment', async () => {
    const runtime = await bootAdmin({ admin: { seed: SEED } });
    const token = await loginToken(runtime);
    const comment = 'SENTINEL-comentario-del-guardado';
    const title = 'SENTINEL-titulo-servicio';
    const summary = 'SENTINEL-resumen-servicio';
    expect((await save(runtime, token, { baseVersions: { es: 1, en: 1 }, comment, documents: docs(title, 'SENTINEL-title-en', summary) })).status).toBe(200);
    const log = runtime.server.log();
    const events = log
      .split('\n')
      .filter((line) => line.includes('"event":"admin_content_save"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'services', outcome: 'ok', status: 200, es_version: 2, en_version: 2, error_count: 0 });
    expect(events[0]?.request_id).toMatch(/^[0-9a-f]{32}$/);
    for (const forbidden of [comment, title, summary, 'SENTINEL-title-en', token]) expect(log, forbidden).not.toContain(forbidden);
  }, 120_000);

  it('T352: projects edited through the handlers show on / and /en/ at once; an anonymous project with a client is refused by the fake and never reaches the public HTML', async () => {
    type Projects = { projects: Array<Record<string, unknown>> };
    const runtime = await bootAdmin({ admin: { seed: { projects: { es: sample('projects.es'), en: sample('projects.en') } } } });
    const token = await loginToken(runtime);
    expect((await send(runtime, '/')).text).toContain('Proyecto público de ejemplo');
    const es = sample('projects.es') as Projects;
    const en = sample('projects.en') as Projects;
    es.projects[0] = { ...es.projects[0], title: 'Proyecto renovado desde el panel' };
    en.projects[0] = { ...en.projects[0], title: 'Project renewed from the panel' };
    const fresh = { id: 'proyecto-nuevo', summary: 'Resumen ficticio', relation: 'own', disclosure: 'public', stack: ['TypeScript'], highlights: [], links: [] };
    es.projects.push({ ...fresh, title: 'Proyecto nuevo del panel' });
    en.projects.push({ ...fresh, title: 'New project from the panel', summary: 'Made-up summary' });
    const saved = await send(runtime, '/admin/api/content/projects/', { method: 'PUT', cookie: token, body: { baseVersions: { es: 1, en: 1 }, documents: { es, en } } });
    expect(saved.status).toBe(200);
    const home = await send(runtime, '/');
    const english = await send(runtime, '/en/');
    expect(home.text).toContain('Proyecto renovado desde el panel');
    expect(home.text).toContain('Proyecto nuevo del panel');
    expect(home.text).not.toContain('Proyecto público de ejemplo');
    expect(english.text).toContain('Project renewed from the panel');
    expect(english.text).toContain('New project from the panel');

    const sentinel = 'SENTINEL-cliente-anonimo';
    for (const document of [es, en]) document.projects[1] = { ...document.projects[1], client: sentinel };
    const refused = await send(runtime, '/admin/api/content/projects/', { method: 'PUT', cookie: token, body: { baseVersions: { es: 2, en: 2 }, documents: { es, en } } });
    expect(refused.status).toBe(422);
    expect(refused.json()).toMatchObject({ code: 'CONTENT_INVALID', errors: expect.arrayContaining([{ path: 'es.projects[1].client', code: 'ANONYMOUS_CLIENT_FORBIDDEN' }]) });
    for (const path of ['/', '/en/']) {
      const page = await send(runtime, path);
      expect(page.status).toBe(200);
      expect(page.text).not.toContain(sentinel);
    }
    expect((await send(runtime, '/')).text).toContain('Proyecto renovado desde el panel');
  }, 120_000);
  it('T363: the hexagon saved through the handlers shows its new adapter on / and /en/ at once', async () => {
    type Architecture = { core: Record<string, unknown>; ports: Array<{ adapters: Array<Record<string, unknown>> }> };
    const runtime = await bootAdmin({ admin: { seed: { architecture: { es: sample('architecture.es'), en: sample('architecture.en') } } } });
    const token = await loginToken(runtime);
    const before = await send(runtime, '/');
    expect(before.text).toContain('Base de datos');
    expect(before.text).not.toContain('Adaptador nuevo del panel');
    const es = sample('architecture.es') as Architecture;
    const en = sample('architecture.en') as Architecture;
    es.ports[1]?.adapters.push({ id: 'adaptador-nuevo', name: 'Adaptador nuevo del panel', status: 'production', note: 'Nota del panel' });
    en.ports[1]?.adapters.push({ id: 'adaptador-nuevo', name: 'New panel adapter', status: 'production', note: 'Panel note' });
    const saved = await send(runtime, '/admin/api/content/architecture/', { method: 'PUT', cookie: token, body: { baseVersions: { es: 1, en: 1 }, comment: 'Adaptador nuevo', documents: { es, en } } });
    expect(saved.status).toBe(200);
    const home = await send(runtime, '/');
    const english = await send(runtime, '/en/');
    expect(home.status).toBe(200);
    expect(home.text).toContain('Adaptador nuevo del panel');
    expect(english.text).toContain('New panel adapter');
    expect(english.text).not.toContain('Adaptador nuevo del panel');
    // The ids never reach the public HTML either.
    expect(home.text).not.toContain('adaptador-nuevo');
    const editor = await send(runtime, '/admin/architecture/', { cookie: token });
    expect(editor.status).toBe(200);
    expect(editor.text).toContain('Adaptador nuevo del panel');
  }, 120_000);
});
