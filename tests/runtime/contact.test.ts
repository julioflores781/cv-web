// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeApi } from '@/tests/helpers/fake-api';
import type { Handler, TestServer } from '@/tests/helpers/http-server';
import { startStandalone, type StandaloneServer } from '@/tests/helpers/standalone';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const SECRET = { name: 'Nombre-Centinela-Ada', email: 'centinela-ada@example.test', message: 'Mensaje centinela de prueba para el log' };
const IP = '203.0.113.77';

async function boot(contact: Handler): Promise<{ api: TestServer; server: StandaloneServer }> {
  const api = await startFakeApi({ contact });
  const server = await startStandalone({ apiUrl: api.url });
  cleanups.push(async () => {
    await server.stop();
    await api.close();
  });
  return { api, server };
}

const send = (server: StandaloneServer, body: unknown, path = '/api/contact/?lang=es') =>
  fetch(`${server.url}${path}`, { redirect: 'manual', method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP }, body: JSON.stringify(body) });

describe('runtime contact', () => {
  it('T76 (runtime): with the API silent or gone the standalone answers 504 CONTACT_TIMEOUT / 502 CONTACT_UPSTREAM without the internal URL', async () => {
    const { api, server } = await boot((_req, res) => res.writeHead(500).end());
    const upstream = await send(server, { ...SECRET, website: '' });
    expect(upstream.status).toBe(502);
    expect(await upstream.json()).toMatchObject({ code: 'CONTACT_UPSTREAM' });
    await api.close();
    const gone = await send(server, { ...SECRET, website: '' });
    expect(gone.status).toBe(502);
    expect(await gone.text()).not.toContain(api.url);
    const silent = await startFakeApi({ contact: () => undefined });
    cleanups.push(() => silent.close());
    const other = await startStandalone({ apiUrl: silent.url });
    cleanups.push(() => other.stop());
    const started = Date.now();
    const timeout = await send(other, { ...SECRET, website: '' });
    expect(timeout.status).toBe(504);
    expect(await timeout.json()).toMatchObject({ code: 'CONTACT_TIMEOUT' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(9_000);
  }, 90_000);

  it('T80: after valid and invalid sends the server log holds no name, email, message nor IP', async () => {
    const { server } = await boot((_req, res) => res.writeHead(201).end());
    expect((await send(server, { ...SECRET, website: '' })).status).toBe(201);
    expect((await send(server, { ...SECRET, email: 'nope', website: '' })).status).toBe(400);
    expect((await send(server, '{broken')).status).toBe(400);
    const log = server.log();
    for (const needle of [SECRET.name, SECRET.email, SECRET.message, IP]) expect(log).not.toContain(needle);
  }, 60_000);

  it('T82: POST /api/contact (no slash) redirects 308 to /api/contact/, which answers; and the page posts straight to the slash form', async () => {
    const { server } = await boot((_req, res) => res.writeHead(201).end());
    const redirect = await send(server, { ...SECRET, website: '' }, '/api/contact');
    expect(redirect.status).toBe(308);
    const target = new URL(redirect.headers.get('Location') ?? '', server.url);
    expect(target.pathname).toBe('/api/contact/');
    expect((await send(server, { ...SECRET, website: '' })).status).toBe(201);
    const client = readFileSync(new URL('../../lib/contact/client.ts', import.meta.url), 'utf8');
    expect(client).toContain('/api/contact/?lang=');
  }, 60_000);
});
