// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SENTINELS } from '@/tests/helpers/fake-api';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { GET } from './route';

let server: TestServer | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await server?.close();
  server = undefined;
});

describe('GET /api/health/', () => {
  it('T54: answers 200 {"status":"ok","api":"up"} as JSON with no-store when the API is ready', async () => {
    server = await startServer((_req, res) => json(res, 200, { status: 'UP' }));
    vi.stubEnv('CV_API_URL', server.url);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', api: 'up' });
  });

  it('T55: answers 503 {"status":"degraded","api":"down"} with no URL, error message or sentinel when the API is down', async () => {
    const down = await closedPortUrl();
    vi.stubEnv('CV_API_URL', down);
    const response = await GET();
    const text = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({ status: 'degraded', api: 'down' });
    for (const leak of [down, new URL(down).host, 'ECONNREFUSED', 'ApiFetchError', 'cv-api', ...Object.values(SENTINELS)]) {
      expect(text).not.toContain(leak);
    }
  });
});
