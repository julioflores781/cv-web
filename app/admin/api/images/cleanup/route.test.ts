// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { adminReq, freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import { captureLogs } from '@/tests/helpers/capture-log';
import { POST } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const HOUR = 3_600_000;
const call = (token: string, body: unknown) => POST(adminReq('/admin/api/images/cleanup/', { cookie: token, body }));

describe('POST /admin/api/images/cleanup', () => {
  it('T375: validates the body (whole hours >= 1; dryRun defaults to true), turns it into the query of the API and never forwards 0; the body is limited to 4 KB', async () => {
    let now = Date.UTC(2026, 10, 1);
    const api = await startAdminApi({ clock: () => now });
    cleanups.push(api.restore);
    const token = await freshToken(api);
    const id = '00000000-0000-4000-8000-0000000000aa';
    api.admin?.state.images.set(id, { id, key: `site/projects/${id}.png`, contentType: 'image/png', bytes: 10, width: 1, height: 1, lastModified: now - 30 * HOUR });
    const log = captureLogs();
    const cleanupCalls = () => api.requests.filter((url) => url.startsWith('/api/v1/admin/images/cleanup'));

    for (const body of [{ olderThanHours: 0 }, { olderThanHours: -3 }, { olderThanHours: 1.5 }, { olderThanHours: '24' }, { dryRun: 'false' }, { dryRun: null }, { olderThanHours: 1e9 }]) {
      const response = await call(token, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'ADMIN_BAD_REQUEST' });
    }
    expect((await call(token, '[1]')).status).toBe(400);
    const big = await call(token, { olderThanHours: 24, padding: 'x'.repeat(5000) });
    expect(big.status).toBe(413);
    expect(cleanupCalls()).toEqual([]);

    const simulated = await call(token, {});
    expect(simulated.status).toBe(200);
    expect(await simulated.json()).toEqual({ dryRun: true, deleted: [], wouldDelete: [`site/projects/${id}.png`], kept: 0 });
    // Unknown fields are dropped; only the two parameters travel, as a query.
    expect((await call(token, { dryRun: true, olderThanHours: 48, extra: 'x' })).status).toBe(200);
    const deleted = await call(token, { dryRun: false, olderThanHours: 1 });
    expect(await deleted.json()).toEqual({ dryRun: false, deleted: [`site/projects/${id}.png`], wouldDelete: [], kept: 0 });
    expect(cleanupCalls()).toEqual([
      '/api/v1/admin/images/cleanup?dryRun=true&olderThanHours=24',
      '/api/v1/admin/images/cleanup?dryRun=true&olderThanHours=48',
      '/api/v1/admin/images/cleanup?dryRun=false&olderThanHours=1',
    ]);
    expect(log.events('admin_image_cleanup').map(({ outcome, dry_run, count }) => [outcome, dry_run, count])).toEqual([
      ['ok', true, 1],
      ['ok', true, 0],
      ['ok', false, 1],
    ]);

    now += HOUR;
    api.admin?.setStorage(false);
    const down = await call(token, {});
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ code: 'IMAGE_STORAGE_UNAVAILABLE' });
    log.restore();
  });
});
