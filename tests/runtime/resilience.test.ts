// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { servicesEs } from '@/tests/fixtures/content';
import { startFakeApi, type FakeReply } from '@/tests/helpers/fake-api';
import { closedPortUrl, type TestServer } from '@/tests/helpers/http-server';
import { get } from '@/tests/helpers/runtime-pages';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

interface Scenario {
  api: TestServer;
  server: StandaloneServer;
  /** Replaces the fake API's answers from now on (`undefined` restores the fixtures). */
  override: (reply: ((resource: string) => FakeReply | undefined) | undefined) => void;
}

async function scenario(apiUrl?: string): Promise<Scenario> {
  let respond: ((resource: string) => FakeReply | undefined) | undefined;
  const api = await startFakeApi({ respond: (resource) => respond?.(resource) });
  const server = await startStandalone({ apiUrl: apiUrl ?? api.url });
  cleanups.push(async () => {
    await server.stop();
    await api.close();
  });
  return { api, server, override: (reply) => (respond = reply) };
}

const problem = (status: number) => ({ title: 't', detail: 'd', status, code: 'X' });
const requestsFor = (api: TestServer, resource: string) => api.requests.filter((url) => url.startsWith(`/api/v1/${resource}?`));

function expectNoInternals(body: string, ...internals: string[]): void {
  for (const secret of ['cv-api', 'ECONNREFUSED', 'ApiFetchError', 'node_modules', ...internals]) expect(body).not.toContain(secret);
  expect(body).not.toMatch(/\n\s+at /);
}

describe('runtime resilience (no cache between requests)', () => {
  it('T35: when the API changes a service between two requests, the second response shows it and the log has 2 requests per resource', async () => {
    let title = servicesEs[0]?.title as string;
    const { api, server, override } = await scenario();
    override((resource) => (resource === 'services' ? { status: 200, body: servicesEs.map((s, i) => (i === 0 ? { ...s, title } : s)) } : undefined));
    const first = await get(server, '/servicios/');
    expect(first.text).toContain(title);
    title = 'Servicio cambiado de ejemplo';
    const second = await get(server, '/servicios/');
    expect(second.status).toBe(200);
    expect(second.text).toContain('Servicio cambiado de ejemplo');
    for (const resource of ['resume', 'architecture', 'services', 'projects']) expect(requestsFor(api, resource), resource).toHaveLength(2);
  }, 60_000);

  it('T37: with the API down from the start the page is a 500 that leaks no internals, and the log carries a [cv-web] error', async () => {
    const down = await closedPortUrl();
    const { server } = await scenario(down);
    const result = await get(server, '/');
    expect(result.status).toBe(500);
    expectNoInternals(result.text, down, new URL(down).host);
    expect(server.log()).toMatch(/\[cv-web\] .*unavailable/);
  }, 60_000);

  it('T38: a 404 for the CV is a controlled 500, not a 200 with an empty h1', async () => {
    const { server, override } = await scenario();
    override((resource) => (resource === 'resume' ? { status: 404, body: problem(404) } : undefined));
    const result = await get(server, '/');
    expect(result.status).toBe(500);
    expect(result.text).not.toContain('<h1');
    expectNoInternals(result.text);
  }, 60_000);

  it('T39: garbage from projects is a 500, and once the API is fixed the next request is a 200', async () => {
    const { server, override } = await scenario();
    override((resource) => (resource === 'projects' ? { status: 200, body: '{ garbage' } : undefined));
    expect((await get(server, '/')).status).toBe(500);
    override(undefined);
    expect((await get(server, '/')).status).toBe(200);
  }, 60_000);

  it('T40: a page that just answered 200 becomes a 500 when the API turns 503 (no stale data)', async () => {
    const { server, override } = await scenario();
    expect((await get(server, '/servicios/')).status).toBe(200);
    override(() => ({ status: 503, body: problem(503) }));
    const result = await get(server, '/servicios/');
    expect(result.status).toBe(500);
    expect(result.text).not.toContain('Ada Ejemplo');
  }, 60_000);
});
