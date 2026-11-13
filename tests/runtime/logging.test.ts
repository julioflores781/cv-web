// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closedPortUrl } from '@/tests/helpers/http-server';
import { startFakeApi, type FakeReply } from '@/tests/helpers/fake-api';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';
import type { TestServer } from '@/tests/helpers/http-server';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function boot(options: Parameters<typeof startFakeApi>[0] = {}): Promise<{ api: TestServer; server: StandaloneServer }> {
  const api = await startFakeApi(options);
  const server = await startStandalone({ apiUrl: api.url });
  cleanups.push(async () => {
    await server.stop();
    await api.close();
  });
  return { api, server };
}

/** The JSON lines the server printed (Next's own banner is not JSON). */
function jsonLines(server: StandaloneServer): Array<Record<string, unknown>> {
  return server
    .log()
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const requestIdsOf = (api: TestServer): string[] => api.headers.flatMap((headers) => (typeof headers['x-request-id'] === 'string' ? [headers['x-request-id']] : []));

describe('runtime logging (real standalone server)', () => {
  it('W17: with the API answering 500, GET / is a 500 and the server log has api_call lines with the request id the API received, and a render_error (onRequestError runs in the standalone)', async () => {
    const failing: FakeReply = { status: 500, body: { title: 't', detail: 'd', status: 500, code: 'UNEXPECTED' } };
    const { api, server } = await boot({ respond: () => failing });
    const page = await fetch(`${server.url}/?utm=CANARY-QUERY`);
    expect(page.status).toBe(500);
    await vi.waitFor(() => expect(jsonLines(server).some((line) => line.event === 'render_error')).toBe(true), { timeout: 10_000 });

    const lines = jsonLines(server);
    const calls = lines.filter((line) => line.event === 'api_call');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const received = requestIdsOf(api);
    for (const call of calls) {
      expect(call).toMatchObject({ level: 'warn', service: 'cv-web', outcome: 'http_error', status: 500 });
      expect(received).toContain(call.request_id);
    }
    const renderError = lines.find((line) => line.event === 'render_error');
    expect(renderError).toMatchObject({ level: 'error', service: 'cv-web', route_type: 'render', method: 'GET', path: '/' });
    expect(renderError?.route_path).toEqual(expect.any(String));
    const raw = server.log();
    expect(raw).not.toMatch(/CANARY|utm=|127\.0\.0\.1:\d+\/api/);
  }, 90_000);

  it('W18: a healthy API leaves no line for /api/health/ and exactly one for a valid contact POST, with the request id the API received and no canary', async () => {
    const received: string[] = [];
    const { api, server } = await boot({
      contact: (req, res) => {
        received.push(String(req.headers['x-request-id']));
        res.writeHead(201).end();
      },
    });
    expect((await fetch(`${server.url}/api/health/`)).status).toBe(200);
    expect(jsonLines(server)).toEqual([]);

    const canaries = { name: 'CANARY-NAME-Zed', email: 'canary-email@example.test', message: 'CANARY-MESSAGE contenido privado de ejemplo', website: '' };
    const response = await fetch(`${server.url}/api/contact/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.77', Cookie: 'sid=CANARY-COOKIE' },
      body: JSON.stringify(canaries),
    });
    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(jsonLines(server)).toHaveLength(1), { timeout: 10_000 });
    const [line] = jsonLines(server);
    expect(line).toMatchObject({ level: 'info', service: 'cv-web', event: 'contact', outcome: 'sent', status: 201 });
    expect(received).toEqual([line?.request_id]);
    expect(response.headers.get('X-Request-Id')).toBe(line?.request_id);
    expect(requestIdsOf(api)).toContain(line?.request_id);
    expect(server.log()).not.toMatch(/CANARY|203\.0\.113/);
  }, 90_000);

  it('extra: a degraded health (API not ready) answers 503 and leaves one health WARN with the id of the API probe', async () => {
    const { api, server } = await boot({ respond: (resource) => (resource.includes('health') ? { status: 503, body: { status: 'DOWN' } } : undefined) });
    expect((await fetch(`${server.url}/api/health/`)).status).toBe(503);
    await vi.waitFor(() => expect(jsonLines(server).some((line) => line.event === 'health')).toBe(true), { timeout: 10_000 });
    const lines = jsonLines(server);
    const health = lines.find((line) => line.event === 'health');
    expect(health).toMatchObject({ level: 'warn', outcome: 'degraded', status: 503 });
    expect(requestIdsOf(api)).toEqual([health?.request_id]);
    expect(lines.find((line) => line.event === 'api_call')).toMatchObject({ request_id: health?.request_id, status: 503, path: '/q/health/ready' });
  }, 90_000);

  it('C1: with the API down, neither the server output (ours and Next\'s own error) nor the 500 body holds the API host, port or address', async () => {
    const down = await closedPortUrl();
    const { port } = new URL(down);
    const server = await startStandalone({ apiUrl: down });
    cleanups.push(() => server.stop());
    const page = await fetch(`${server.url}/`);
    const body = await page.text();
    expect(page.status).toBe(500);
    await vi.waitFor(() => expect(jsonLines(server).some((line) => line.event === 'render_error')).toBe(true), { timeout: 10_000 });
    expect(server.log()).toMatch(/"outcome":"unreachable"/);
    expect(server.log()).toContain('ECONNREFUSED');
    for (const text of [server.log().replace(server.url, ''), body]) {
      expect(text).not.toContain(`:${port}`);
      expect(text).not.toContain(`port: ${port}`);
      expect(text).not.toMatch(/address:|connect ECONNREFUSED|localhost:\d+\/api/);
    }
    expect(body).not.toMatch(/ECONNREFUSED|ApiFetchError|ResumeFetchError|127\.0\.0\.1/);
  }, 90_000);
});
