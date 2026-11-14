// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { listMessages } from './messages';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const PAGE = {
  messages: [
    { id: 41, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'Hola', createdAt: '2026-11-10T18:00:00Z', ip_hash: 'HASH-SENTINEL', extra: true },
    { id: 40, name: 'Grace Ejemplo', email: 'grace@example.test', body: 'Otro', createdAt: '2026-11-09T18:00:00Z' },
  ],
  next: '40',
};

describe('listMessages', () => {
  it('T221: validates limit (1 to 100) and before (positive integer) before asking, parses next (null included) and drops unknown fields such as ip_hash', async () => {
    server = await startServer((req, res) => json(res, 200, req.url?.includes('before=40') ? { messages: [], next: null } : PAGE));
    const base = { baseUrl: server.url, retryDelayMs: 1 };
    for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { before: 0 }, { before: -3 }, { before: 2.5 }]) {
      expect(await listMessages(query, base)).toMatchObject({ kind: 'invalid', source: 'input' });
    }
    expect(server.requests).toEqual([]);

    const first = await listMessages({ limit: 2 }, base);
    expect(first.kind === 'ok' && first.data.next).toBe('40');
    expect(first.kind === 'ok' && first.data.messages).toHaveLength(2);
    expect(JSON.stringify(first)).not.toMatch(/ip_hash|HASH-SENTINEL|extra/);
    const last = await listMessages({ limit: 2, before: 40 }, base);
    expect(last).toMatchObject({ kind: 'ok', data: { messages: [], next: null } });
    expect(server.requests).toEqual(['/api/v1/admin/contact-messages?limit=2', '/api/v1/admin/contact-messages?limit=2&before=40']);
  });

  it('T221 (shape): a message without a valid createdAt, or a page without messages, is invalid', async () => {
    const bodies = [{ messages: [{ id: 1, name: 'a', email: 'b', body: 'c', createdAt: 'nope' }], next: null }, { next: null }];
    let next = 0;
    server = await startServer((_req, res) => json(res, 200, bodies[next++]));
    for (let i = 0; i < 2; i += 1) expect((await listMessages({}, { baseUrl: server.url, retryDelayMs: 1 })).kind).toBe('invalid');
  });
});
