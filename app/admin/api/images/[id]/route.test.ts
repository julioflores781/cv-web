// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { adminReq, freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import { captureLogs } from '@/tests/helpers/capture-log';
import { DELETE, GET } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const USED = '00000000-0000-4000-8000-000000000001';
const ORPHAN = '00000000-0000-4000-8000-0000000000aa';
const keyOf = (id: string) => `site/projects/${id}.webp`;
const project = (id: string) => ({ id: 'proyecto', title: 'Proyecto', summary: 'Resumen.', relation: 'own', disclosure: 'public', stack: [], highlights: [], links: [], images: [{ key: keyOf(id), alt: 'Texto', width: 10, height: 10 }] });

const remove = (id: string, token: string, options: { origin?: string | null } = {}) =>
  DELETE(adminReq(`/admin/api/images/${id}/`, { method: 'DELETE', cookie: token, contentType: null, ...options }), { params: Promise.resolve({ id }) });

describe('DELETE /admin/api/images/[id]', () => {
  it('T374: ..%2f, abc and an uppercase UUID are 400 with no call; a valid UUID maps 204 -> 200, 409 IMAGE_IN_USE and 404; admin_image_delete logs the outcome', async () => {
    const api = await startAdminApi({ seed: { projects: { es: { projects: [project(USED)] }, en: { projects: [project(USED)] } } } });
    cleanups.push(api.restore);
    const token = await freshToken(api);
    const state = api.admin?.state;
    for (const id of [USED, ORPHAN]) state?.images.set(id, { id, key: keyOf(id), contentType: 'image/webp', bytes: 10, width: 10, height: 10, lastModified: Date.now() });
    const log = captureLogs();

    for (const id of ['..%2f..%2fetc', '../x', 'abc', ORPHAN.toUpperCase(), '']) {
      const response = await remove(id, token);
      expect(response.status, id).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_BAD_REQUEST' });
    }
    expect(api.admin?.state.received.filter((request) => request.method === 'DELETE')).toEqual([]);

    const ok = await remove(ORPHAN, token);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(ok.headers.get('cache-control')).toBe('no-store');
    const inUse = await remove(USED, token);
    expect(inUse.status).toBe(409);
    expect(await inUse.json()).toMatchObject({ code: 'IMAGE_IN_USE' });
    const gone = await remove(ORPHAN, token);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ code: 'IMAGE_NOT_FOUND' });
    api.admin?.setStorage(false);
    const down = await remove(ORPHAN, token);
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ code: 'IMAGE_STORAGE_UNAVAILABLE' });

    expect(log.events('admin_image_delete').map(({ outcome, status }) => [outcome, status])).toEqual([
      ...Array.from({ length: 5 }, () => ['rejected', 400]),
      ['ok', 200],
      ['in_use', 409],
      ['not_found', 404],
      ['unavailable', 503],
    ]);
    for (const entry of log.events('admin_image_delete')) expect(Object.keys(entry).sort()).toEqual(['event', 'level', 'outcome', 'request_id', 'service', 'status', 'timestamp']);
    expect(log.text()).not.toContain(ORPHAN);
    log.restore();
  });

  it('extra (AC7): a foreign Origin is a 403 with no call, a DELETE needs no body type, and GET is 405', async () => {
    const api = await startAdminApi();
    cleanups.push(api.restore);
    const token = await freshToken(api);
    const response = await remove(ORPHAN, token, { origin: 'https://evil.example.test' });
    expect(response.status).toBe(403);
    expect(api.admin?.state.received.filter((request) => request.method === 'DELETE')).toEqual([]);
    expect((await remove(ORPHAN, token)).status).toBe(404);
    expect((await GET()).status).toBe(405);
  });
});
