// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { closedPortUrl } from '@/tests/helpers/http-server';
import { adminReq, COOKIE, freshToken, setCookies, startAdminApi } from '@/tests/helpers/admin-routes';
import { adminSession } from '@/lib/api/admin';
import { GET, POST } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});
const call = (cookie?: string) => POST(adminReq('/admin/api/logout-all/', { body: {}, ...(cookie === undefined ? {} : { cookie }) }));

describe('POST /admin/api/logout-all', () => {
  it('T266: API 204 is 200 and clears the cookie; API 401 clears it too; an API that is down is 502 and keeps it', async () => {
    const api = await startAdminApi();
    cleanups.push(api.restore);
    const token = await freshToken(api);
    const ok = await call(token);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(setCookies(ok)[0]).toContain(`${COOKIE}=;`);
    expect(setCookies(ok)[0]).toMatch(/Max-Age=0/);
    expect((await adminSession({ token, baseUrl: api.url })).kind).toBe('problem');

    const expired = await call(token);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'ADMIN_UNAUTHORIZED' });
    expect(setCookies(expired)[0]).toMatch(/Max-Age=0/);

    process.env.CV_API_URL = await closedPortUrl();
    const down = await call('whatever.token');
    expect(down.status).toBe(502);
    expect(await down.json()).toMatchObject({ code: 'ADMIN_UPSTREAM' });
    expect(setCookies(down)).toEqual([]);
  });

  it('extra: without a cookie it is a 401 and the API is not called; GET is 405', async () => {
    const api = await startAdminApi();
    cleanups.push(api.restore);
    expect((await call()).status).toBe(401);
    expect(api.requests).toEqual([]);
    expect((await GET()).status).toBe(405);
  });
});
