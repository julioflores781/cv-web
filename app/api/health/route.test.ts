// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
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

  it('W11: a healthy API leaves no log; a down API answers 503 and leaves one WARN health/degraded with the request_id of the API call', async () => {
    const logs = captureLogs();
    server = await startServer((_req, res) => json(res, 200, { status: 'UP' }));
    vi.stubEnv('CV_API_URL', server.url);
    expect((await GET()).status).toBe(200);
    expect(logs.lines()).toEqual([]);
    await server.close();

    const ids: Array<string | string[] | undefined> = [];
    server = await startServer((req, res) => {
      ids.push(req.headers['x-request-id']);
      json(res, 503, { status: 'DOWN' });
    });
    vi.stubEnv('CV_API_URL', server.url);
    expect((await GET()).status).toBe(503);
    const [health] = logs.events('health');
    expect(logs.events('health')).toHaveLength(1);
    expect(health).toMatchObject({ level: 'warn', service: 'cv-web', outcome: 'degraded', status: 503, request_id: ids[0] });
    expect(logs.text()).not.toMatch(/127\.0\.0\.1/);
  });
});
