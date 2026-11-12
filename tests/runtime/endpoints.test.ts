// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeApi } from '@/tests/helpers/fake-api';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';
import type { TestServer } from '@/tests/helpers/http-server';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function boot(): Promise<{ api: TestServer; server: StandaloneServer }> {
  const api = await startFakeApi();
  const server = await startStandalone({ apiUrl: api.url });
  cleanups.push(async () => {
    await server.stop();
    await api.close();
  });
  return { api, server };
}

describe('runtime endpoints', () => {
  it('T56: GET /api/health (no slash) redirects 308 to /api/health/, and the slash form answers', async () => {
    const { server } = await boot();
    const redirect = await fetch(`${server.url}/api/health`, { redirect: 'manual' });
    expect(redirect.status).toBe(308);
    expect(new URL(redirect.headers.get('Location') ?? '', server.url).pathname).toBe('/api/health/');
    const ok = await fetch(`${server.url}/api/health/`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'ok', api: 'up' });
  }, 60_000);
});
