import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import PanelLayout from './layout';

const request = vi.hoisted(() => ({ token: '', headers: new Headers() }));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
);
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (request.token && name.startsWith('cv_') ? { name, value: request.token } : undefined) }),
  headers: async () => request.headers,
}));
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/admin/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  redirect.mockClear();
  request.headers = new Headers();
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function deadSession(): Promise<void> {
  const api = await startAdminApi();
  cleanups.push(api.restore);
  await freshToken(api);
  request.token = 'not-a-session';
}

const enter = () => PanelLayout({ children: null }).catch((error: unknown) => error);

describe('panel layout', () => {
  it('regresion extra: a dead session goes to the login with the page it was on as next (the path the proxy passed, validated)', async () => {
    await deadSession();
    request.headers = new Headers({ 'x-admin-path': '/admin/messages/?before=2' });
    await enter();
    expect(redirect).toHaveBeenCalledWith(`/admin/login/?expired=1&next=${encodeURIComponent('/admin/messages/?before=2')}`);
  });

  it('regresion extra: without that header, or with one that is not a panel path, next falls back to /admin/', async () => {
    await deadSession();
    for (const value of [null, 'https://evil.example/', '//evil.example', '/admin/../x']) {
      request.headers = new Headers(value === null ? {} : { 'x-admin-path': value });
      await enter();
      expect(redirect, String(value)).toHaveBeenLastCalledWith(`/admin/login/?expired=1&next=${encodeURIComponent('/admin/')}`);
    }
  });
});
