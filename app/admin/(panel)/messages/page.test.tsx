import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import { captureLogs } from '@/tests/helpers/capture-log';
import type { AdminFakeOptions } from '@/scripts/parity/admin-fake.mjs';
import MessagesLoading from './loading';
import MessagesPage from './page';

const session = vi.hoisted(() => ({ token: '' }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/admin/messages/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  redirect.mockReset();
  vi.restoreAllMocks();
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function boot(options: AdminFakeOptions = {}) {
  const api = await startAdminApi(options);
  cleanups.push(api.restore);
  session.token = await freshToken(api);
  return api;
}

type Api = Awaited<ReturnType<typeof boot>>;
const page = (search: Record<string, string | string[]> = {}) => MessagesPage({ searchParams: Promise.resolve(search) });
/** Query strings the API got for the list, in order. */
const asked = (api: Api) => api.requests.filter((url) => url.includes('/contact-messages')).map((url) => url.slice(url.indexOf('/contact-messages') + '/contact-messages'.length));
const rows = () => within(screen.getByRole('list', { name: 'Mensajes recibidos' })).getAllByRole('listitem');

/** `count` fictitious messages, ids 1..count, one per minute (the newest has the highest id). */
const many = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Persona Ejemplo ${i + 1}`,
    email: `persona${i + 1}@example.test`,
    body: `Texto ficticio ${i + 1}.`,
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, i)).toISOString(),
    ipHash: `HASH-SENTINEL-${i + 1}`,
  }));

describe('messages screen', () => {
  it('T402: with the fake, the rows come newest first with id, date (<time dateTime>), name, email and body', async () => {
    const api = await boot();
    render(await page());
    expect(screen.getByRole('heading', { level: 1, name: 'Mensajes' })).toBeInTheDocument();
    const list = rows();
    expect(list.map((row) => within(row).getByRole('heading', { level: 3 }).textContent)).toEqual(['Ada Ejemplo', 'Grace Ejemplo', 'Alan Ejemplo']);
    const dates = list.map((row) => row.querySelector('time')?.getAttribute('dateTime'));
    expect(dates).toEqual(['2026-11-03T10:00:00Z', '2026-11-02T10:00:00Z', '2026-11-01T10:00:00Z']);
    expect([...dates].sort().reverse()).toEqual(dates);
    const first = list[0] as HTMLElement;
    expect(within(first).getByText('Id').nextElementSibling).toHaveTextContent('3');
    expect(within(first).getByRole('link', { name: 'ada@example.test' })).toHaveAttribute('href', 'mailto:ada@example.test');
    expect(within(first).getByText('Hola, es un mensaje ficticio.')).toBeInTheDocument();
    expect(asked(api)).toEqual(['?limit=50']);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('T405: «Más antiguos» follows `next`; the last page has no link; a `before` that is not a positive integer is ignored and `limit` is never the visitor\'s', async () => {
    const api = await boot({ messages: many(120) });
    const first = render(await page());
    expect(rows()).toHaveLength(50);
    expect(screen.getByRole('link', { name: 'Más antiguos' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?\?before=71$/));
    first.unmount();

    const second = render(await page({ before: '71' }));
    expect(within(rows()[0] as HTMLElement).getByText('Id').nextElementSibling).toHaveTextContent('70');
    expect(screen.getByRole('link', { name: 'Más antiguos' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?\?before=21$/));
    second.unmount();

    const last = render(await page({ before: '21' }));
    expect(rows()).toHaveLength(20);
    expect(screen.queryByRole('link', { name: 'Más antiguos' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Volver a los más recientes' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?$/));
    last.unmount();
    expect(asked(api)).toEqual(['?limit=50', '?limit=50&before=71', '?limit=50&before=21']);

    api.requests.splice(0);
    for (const before of ['abc', '0', '-5', '99999999999999999999', '1.5', '+7', '71&limit=100', ['71', '21']]) {
      const view = render(await page({ before, limit: '100' }));
      // Ignored: the newest page, as if there were no parameter.
      expect(within(rows()[0] as HTMLElement).getByText('Id').nextElementSibling, String(before)).toHaveTextContent('120');
      view.unmount();
    }
    expect(new Set(asked(api))).toEqual(new Set(['?limit=50']));
  });

  it('T406: skeleton while loading; no messages says so; a failure of the API shows an error with the reference and a retry, and no data', async () => {
    const loading = render(<MessagesLoading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Mensajes');
    loading.unmount();

    const api = await boot({ messages: [] });
    const empty = render(await page());
    expect(screen.getByText('Aún no hay mensajes.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    empty.unmount();

    api.admin?.inject('messages.list', { mode: '500' });
    const down = render(await page({ before: '7' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error: La API no está disponible');
    expect(alert).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/messages\/?\?before=7$/));
    expect(screen.queryByRole('list', { name: 'Mensajes recibidos' })).toBeNull();
    expect(down.container.innerHTML).not.toMatch(/127\.0\.0\.1|localhost/);
    down.unmount();

    api.admin?.clearFaults();
    api.admin?.inject('messages.list', { mode: 'invalid-json' });
    render(await page());
    expect(screen.getByRole('alert')).toHaveTextContent('Error:');
    expect(screen.getByRole('alert')).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
  });

  it('T406 (session): a 401 of the API sends to the login remembering the page', async () => {
    await boot();
    session.token = 'not-a-session';
    await page({ before: '2' }).catch(() => undefined);
    expect(redirect).toHaveBeenCalledWith(`/admin/login/?expired=1&next=${encodeURIComponent('/admin/messages/?before=2')}`);
  });

  it('T407: unknown fields the API sends (an ip_hash, a phone) never reach the DOM', async () => {
    await boot();
    // A hostile or newer API: extra fields inside each message and next to the list.
    const { startServer, json } = await import('@/tests/helpers/http-server');
    const leaky = await startServer((_req, res) =>
      json(res, 200, {
        messages: [
          { id: 9, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'Hola.', createdAt: '2026-11-09T10:00:00Z', ip_hash: 'LEAK-ip-hash', ipHash: 'LEAK-ipHash', senderKey: 'LEAK-sender', phone: 'LEAK-phone' },
        ],
        next: null,
        ip_hash: 'LEAK-top',
      }),
    );
    cleanups.push(leaky.close);
    process.env.CV_API_URL = leaky.url;
    const { container } = render(await page());
    expect(rows()).toHaveLength(1);
    expect(container.innerHTML).not.toMatch(/LEAK|ip_?hash|senderKey|phone/i);
  });

  it('T408: viewing logs `admin_messages_view` with only the request id, the outcome and the count; no name, email or body', async () => {
    const sentinels = { name: 'SENTINEL-NOMBRE', email: 'sentinel-correo@example.test', body: 'SENTINEL-CUERPO del mensaje' };
    const api = await boot({ messages: [{ id: 1, ...sentinels, createdAt: '2026-11-01T10:00:00Z', ipHash: 'SENTINEL-HASH' }] });
    const logs = captureLogs();
    const ok = render(await page());
    expect(ok.container).toHaveTextContent(sentinels.body);
    ok.unmount();
    api.admin?.inject('messages.list', { mode: '500' });
    render(await page());
    session.token = 'not-a-session';
    api.admin?.clearFaults();
    await page().catch(() => undefined);

    const events = logs.events('admin_messages_view');
    expect(events.map(({ level, outcome, count }) => [level, outcome, count])).toEqual([
      ['info', 'ok', 1],
      ['warn', 'unavailable', 0],
      ['warn', 'expired', 0],
    ]);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['count', 'event', 'level', 'outcome', 'request_id', 'service', 'timestamp']);
      expect(event.request_id).toMatch(/^[0-9a-f]{32}$/);
    }
    const text = logs.text();
    for (const forbidden of [...Object.values(sentinels), 'SENTINEL', 'example.test']) expect(text, forbidden).not.toContain(forbidden);
    logs.restore();
  });

  it('extra: the navigation of the panel has the messages entry, before the settings', async () => {
    const { ADMIN_NAV } = await import('@/lib/admin/nav');
    expect(ADMIN_NAV.map((item) => `${item.label} ${item.href}`)).toEqual([
      'Inicio /admin/',
      'Servicios /admin/services/',
      'Proyectos /admin/projects/',
      'Arquitectura /admin/architecture/',
      'Imágenes /admin/images/',
      'Mensajes /admin/messages/',
      'Ajustes /admin/settings/',
    ]);
  });
});
