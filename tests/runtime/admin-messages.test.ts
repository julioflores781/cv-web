// @vitest-environment node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, readText } from '@/tests/helpers/css';
import { bootAdmin, loginToken, registerCleanups, send } from '@/tests/helpers/admin-runtime';

registerCleanups();

const SENTINELS = {
  name: 'SENTINEL-NOMBRE <script>window.hacked = 1</script>',
  email: 'sentinel-correo@example.test',
  body: 'SENTINEL-CUERPO primera línea\nsegunda línea "><img src=x onerror=alert(1)>',
  hash: 'SENTINEL-HASH-IP',
};

const MESSAGES = [
  { id: 2, name: SENTINELS.name, email: SENTINELS.email, body: SENTINELS.body, createdAt: '2026-11-02T10:00:00Z', ipHash: SENTINELS.hash },
  { id: 1, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'Un mensaje ficticio.', createdAt: '2026-11-01T10:00:00Z', ipHash: SENTINELS.hash },
];

describe('admin messages (standalone + fake admin API)', () => {
  it('T409: the page answers no-store and noindex, needs the session, escapes what visitors wrote and has accessible headings; T408: the log keeps no personal data', async () => {
    const runtime = await bootAdmin({ admin: { messages: MESSAGES } });

    // Without a session nothing is read: the gate sends to the login.
    const anonymous = await send(runtime, '/admin/messages/');
    expect(anonymous.status).toBe(307);
    expect(anonymous.headers.get('location')).toContain('/admin/login/');
    expect(anonymous.text).not.toContain('SENTINEL');

    const token = await loginToken(runtime);
    const page = await send(runtime, '/admin/messages/', { cookie: token });
    expect(page.status).toBe(200);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(page.text).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    expect(page.text).toContain('lang="es"');

    // Headings and labels of the list.
    expect(page.text).toMatch(/<h1[^>]*>Mensajes<\/h1>/);
    expect(page.text).toMatch(/<h2[^>]*>Mensajes recibidos<\/h2>/);
    expect(page.text.match(/<h3[^>]*>/g)).toHaveLength(2);
    expect(page.text).toMatch(/<time dateTime="2026-11-02T10:00:00Z"/i);
    expect(page.text).toContain('href="mailto:sentinel-correo@example.test"');
    expect(page.text).toContain('Un mensaje ficticio.');

    // What the visitor wrote is text: no element comes out of it, in the markup or in the flight data.
    expect(page.text).toContain('SENTINEL-NOMBRE &lt;script&gt;');
    expect(page.text).not.toContain('<script>window.hacked');
    expect(page.text).not.toMatch(/<img[^>]*onerror/);
    expect(page.text).not.toContain(SENTINELS.hash);
    expect(page.text).not.toMatch(/ip_?hash/i);

    // The parameters of the visitor never reach the API as they came.
    const before = runtime.api.requests.length;
    const odd = await send(runtime, '/admin/messages/?before=abc&limit=100', { cookie: token });
    expect(odd.status).toBe(200);
    expect(odd.text).toContain('Un mensaje ficticio.');
    const asked = runtime.api.requests.slice(before).filter((url) => url.includes('/contact-messages'));
    expect(asked).toEqual(['/api/v1/admin/contact-messages?limit=50']);

    // Read only: the panel has no handler that writes messages and the API only ever got GETs for them.
    expect(existsSync(path.join(ROOT, 'app/admin/api/messages'))).toBe(false);
    expect(readText('lib/api/admin/messages.ts').match(/method: '[A-Z]+'/g)).toEqual(["method: 'GET'"]);
    expect(runtime.api.admin?.state.messages).toHaveLength(2);
    expect(runtime.api.admin?.state.received.filter((entry) => entry.path.endsWith('/contact-messages')).every((entry) => entry.method === 'GET')).toBe(true);

    const log = runtime.server.log();
    const events = log
      .split('\n')
      .filter((line) => line.includes('"event":"admin_messages_view"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map(({ outcome, count }) => [outcome, count])).toEqual([
      ['ok', 2],
      ['ok', 2],
    ]);
    for (const event of events) expect(Object.keys(event).sort()).toEqual(['count', 'event', 'level', 'outcome', 'request_id', 'service', 'timestamp']);
    for (const forbidden of ['SENTINEL', 'sentinel-correo', 'example.test', 'Ada Ejemplo', 'mensaje ficticio', 'segunda línea', token]) expect(log, forbidden).not.toContain(forbidden);
  }, 120_000);
});
