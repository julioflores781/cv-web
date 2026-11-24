// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeImage } from '@/tests/helpers/admin-images';
import { BROWSER_IP, bootAdmin, COOKIE, loginToken, registerCleanups, send, type AdminRuntime } from '@/tests/helpers/admin-runtime';

registerCleanups();

const MEDIA = 'https://media.example.test';
const service = (title: string) => ({ services: [{ id: 'servicio-ejemplo', title, summary: 'Un servicio ficticio.', price: { from: 1500, currency: 'EUR' } }] });
const project = (title: string, images: unknown[] = []) => ({
  projects: [{ id: 'proyecto-ejemplo', title, summary: 'Un producto propio ficticio.', relation: 'own', disclosure: 'public', startDate: '2024-01', stack: ['Java'], images }],
});
const SEED = {
  services: { es: service('Servicio de ejemplo'), en: service('Sample service') },
  projects: { es: project('Proyecto de Ada Ejemplo'), en: project('Ada Ejemplo project') },
};

/** The browser's upload: a multipart with one `file` part, same Origin, the session cookie. */
async function uploadImage(runtime: AdminRuntime, token: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  form.append('file', new Blob([fakeImage('png', 4096, 1280, 720)], { type: 'image/png' }), 'portada.png');
  const response = await fetch(`${runtime.server.url}/admin/api/images/`, {
    method: 'POST',
    headers: { origin: new URL(runtime.site).origin, cookie: `${COOKIE}=${token}`, 'cf-connecting-ip': BROWSER_IP },
    body: form,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const covers = (html: string): string[] => [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1] as string).filter((src) => src.startsWith(MEDIA));

describe('admin end to end (standalone + fake admin API)', () => {
  it('T420: login → edit services → public → project with an image → public cover → restore → public without it → logout-all → 401', async () => {
    const runtime = await bootAdmin({ admin: { seed: SEED } });
    const token = await loginToken(runtime);

    // The panel opens with the session, behind noindex.
    const dashboard = await send(runtime, '/admin/', { cookie: token });
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    // 1) Services: the editor's read, a save, and the public pages show it at once (no rebuild, no cache).
    const read = await send(runtime, '/admin/api/content/services/', { cookie: token });
    expect(read.status).toBe(200);
    expect(read.json()).toMatchObject({ kind: 'services', languages: { es: { version: 1 }, en: { version: 1 } } });
    const saved = await send(runtime, '/admin/api/content/services/', {
      method: 'PUT',
      cookie: token,
      body: { baseVersions: { es: 1, en: 1 }, comment: 'Precio revisado', documents: { es: service('Servicio renovado'), en: service('Renewed service') } },
    });
    expect(saved.status).toBe(200);
    expect((await send(runtime, '/')).text).toContain('Servicio renovado');
    expect((await send(runtime, '/en/')).text).toContain('Renewed service');

    // 2) Projects: no cover before; upload an image and attach it (own + public); the public page shows it as the cover.
    expect(covers((await send(runtime, '/')).text)).toEqual([]);
    const uploaded = await uploadImage(runtime, token);
    expect(uploaded.status).toBe(201);
    const key = uploaded.body.key as string;
    expect(uploaded.body).toMatchObject({ width: 1280, height: 720, contentType: 'image/png' });
    const image = (alt: string) => ({ key, alt, width: 1280, height: 720 });
    const withImage = await send(runtime, '/admin/api/content/projects/', {
      method: 'PUT',
      cookie: token,
      body: {
        baseVersions: { es: 1, en: 1 },
        documents: { es: project('Proyecto de Ada Ejemplo', [image('Portada de ejemplo')]), en: project('Ada Ejemplo project', [image('Sample cover')]) },
      },
    });
    expect(withImage.status).toBe(200);
    const es = await send(runtime, '/');
    expect(covers(es.text)).toEqual([`${MEDIA}/${key}`]);
    expect(es.text).toContain('alt="Portada de ejemplo"');
    expect(covers((await send(runtime, '/en/')).text)).toEqual([`${MEDIA}/${key}`]);
    // The panel's gallery lists it as in use.
    const gallery = await send(runtime, '/admin/images/', { cookie: token });
    expect(gallery.status).toBe(200);
    expect(gallery.text).toContain(key);

    // 3) History: restoring v1 of both languages takes the cover off the public pages; the image stays in the storage.
    for (const lang of ['es', 'en']) {
      const restored = await send(runtime, `/admin/api/content/projects/${lang}/rollback/`, { method: 'POST', cookie: token, body: { baseVersion: 2, targetVersion: 1 } });
      expect(restored.status, lang).toBe(200);
    }
    expect(covers((await send(runtime, '/')).text)).toEqual([]);
    expect(covers((await send(runtime, '/en/')).text)).toEqual([]);
    expect(runtime.api.admin?.state.images.size).toBe(1);
    // Services were not touched by the projects rollback.
    expect((await send(runtime, '/')).text).toContain('Servicio renovado');

    // 4) «Cerrar todas las sesiones»: the old token is dead for handlers (401 JSON, cookie dropped) and pages (to the login, remembering the page).
    expect((await send(runtime, '/admin/api/logout-all/', { method: 'POST', cookie: token, body: {} })).status).toBe(200);
    const handler = await send(runtime, '/admin/api/content/services/', { cookie: token });
    expect(handler.status).toBe(401);
    expect(handler.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    expect(handler.headers.getSetCookie().some((line) => line.startsWith(`${COOKIE}=;`) && /Path=\/admin/.test(line))).toBe(true);
    const page = await send(runtime, '/admin/projects/', { cookie: token });
    expect(page.status).toBe(307);
    expect(new URL(page.headers.get('location') ?? '', runtime.server.url).search).toBe(`?expired=1&next=${encodeURIComponent('/admin/projects/')}`);
    expect((await uploadImage(runtime, token)).status).toBe(401);

    // The public site never noticed: no panel cookie or header on it, and the log has no token, comment or titles.
    const home = await send(runtime, '/');
    expect(home.status).toBe(200);
    expect(home.headers.get('set-cookie')).toBeNull();
    const log = runtime.server.log();
    for (const forbidden of [token, 'Precio revisado', 'Servicio renovado', 'portada.png', BROWSER_IP]) expect(log, forbidden).not.toContain(forbidden);
    expect(log.split('\n').filter((line) => line.trim() !== '' && line.startsWith('{')).every((line) => JSON.parse(line) !== null)).toBe(true);
  }, 180_000);
});
