// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { adminReq, COOKIE, setCookies, startAdminApi } from '@/tests/helpers/admin-routes';
import { DELETE, GET, POST } from './route';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

describe('POST /admin/api/logout', () => {
  it('T265: with or without a cookie it is an idempotent 200 that clears the cookie with the same attributes and never calls the API', async () => {
    const api = await startAdminApi();
    cleanups.push(api.restore);
    for (const cookie of ['some.token.value', undefined]) {
      const response = await POST(adminReq('/admin/api/logout/', { body: {}, ...(cookie === undefined ? {} : { cookie }) }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      const lines = setCookies(response);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain(`${COOKIE}=;`);
      expect(lines[0]).toMatch(/HttpOnly/i);
      expect(lines[0]).toMatch(/SameSite=strict/i);
      expect(lines[0]).toMatch(/Path=\/admin(;|$)/);
      expect(lines[0]).toMatch(/Max-Age=0/);
    }
    expect(api.requests).toEqual([]);
    expect((await GET()).status).toBe(405);
    expect((await DELETE()).headers.get('allow')).toBe('POST');
  });

  it('extra: a foreign Origin is refused and does not clear anything', async () => {
    const response = await POST(adminReq('/admin/api/logout/', { body: {}, origin: 'https://evil.example.test' }));
    expect(response.status).toBe(403);
    expect(setCookies(response)).toEqual([]);
  });
});
