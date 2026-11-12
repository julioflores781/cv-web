// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { checkApi } from './health';

let server: TestServer | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await server?.close();
  server = undefined;
});

describe('checkApi', () => {
  it('T52: is up when the API answers 200 on /q/health/ready (one request, no retries)', async () => {
    server = await startServer((_req, res) => json(res, 200, { status: 'UP' }));
    vi.stubEnv('CV_API_URL', server.url);
    await expect(checkApi()).resolves.toBe('up');
    expect(server.requests).toEqual(['/q/health/ready?lang=es']);
  });

  it('T53: is down on a 503, a closed port or an answer slower than 2 s (about 2 s, never retried)', async () => {
    server = await startServer((_req, res) => json(res, 503, { status: 'DOWN' }));
    vi.stubEnv('CV_API_URL', server.url);
    await expect(checkApi()).resolves.toBe('down');
    expect(server.requests).toHaveLength(1);
    await server.close();

    vi.stubEnv('CV_API_URL', await closedPortUrl());
    await expect(checkApi()).resolves.toBe('down');

    server = await startServer(() => undefined);
    vi.stubEnv('CV_API_URL', server.url);
    const started = Date.now();
    await expect(checkApi()).resolves.toBe('down');
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(1_900);
    expect(elapsed).toBeLessThan(3_500);
    expect(server.requests).toHaveLength(1);
  });
});
