import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import type { AdminFakeOptions } from '@/scripts/parity/admin-fake.mjs';
import DashboardPage from '../page';
import ServicesPage from '../services/page';
import ArchitectureHistoryPage from './architecture/page';
import HistoryLoading from './loading';
import ProjectsHistoryPage from './projects/page';
import ServicesHistoryPage from './services/page';

const session = vi.hoisted(() => ({ token: '' }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/admin/history/services/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  redirect.mockReset();
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

type Services = { services: Array<Record<string, unknown>> };

/** The fake with services at v1 (seed) and v2 (a save) in both languages. */
async function boot(options: AdminFakeOptions = { seed: { services: { es: sample('services.es'), en: sample('services.en') } } }) {
  const api = await startAdminApi(options);
  cleanups.push(api.restore);
  session.token = await freshToken(api);
  return api;
}

function addVersion(api: Awaited<ReturnType<typeof boot>>, title: string, comment: string | null) {
  for (const lang of ['es', 'en'] as const) {
    const slot = api.admin?.state.content.get('services')?.[lang];
    if (!slot) continue;
    const content = sample(`services.${lang}`) as Services;
    content.services[0] = { ...content.services[0], title };
    const version = slot.versions.length + 1;
    slot.versions.push({ version, publishedAt: Date.UTC(2026, 10, version), source: 'admin', comment, content });
    slot.active = version;
  }
}

const ROUTES = { services: ServicesHistoryPage, projects: ProjectsHistoryPage, architecture: ArchitectureHistoryPage };
const page = (kind: keyof typeof ROUTES, search: Record<string, string> = {}) => ROUTES[kind]({ searchParams: Promise.resolve(search) });
const versionsAsked = (api: Awaited<ReturnType<typeof boot>>) => (api.admin?.state.received ?? []).filter((entry) => entry.path.includes('/versions'));

describe('history screen', () => {
  it('T392 (page): each kind has its own route (an unknown kind has none: its HTTP 404 is checked in the runtime test T400); a known one lists its versions (limit 50) for the language of ?lang=', async () => {
    const api = await boot();
    addVersion(api, 'Servicio renovado', 'Precio nuevo');
    render(await page('services', { lang: 'en' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Historial de servicios' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Versiones en inglés' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Idioma del historial' })).getByRole('link', { name: 'Inglés' })).toHaveAttribute('aria-current', 'page');
    const rows = within(screen.getByRole('list', { name: 'Versiones en inglés' })).getAllByRole('listitem');
    expect(rows.map((node) => within(node).getByText(/^v\d+$/).textContent)).toEqual(['v2', 'v1']);
    expect(within(rows[0] as HTMLElement).getByText('Activa')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('Precio nuevo');
    expect(versionsAsked(api).map((entry) => entry.path)).toEqual(['/api/v1/admin/content/services/en/versions']);
    // An unknown ?lang= falls back to Spanish.
    render(await page('services', { lang: 'fr' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Versiones en español' })).toBeInTheDocument();
  });

  it('T393 (page): a kind never published says «Nunca publicado»', async () => {
    await boot({});
    render(await page('architecture'));
    expect(screen.getByText('Nunca publicado en español.')).toBeInTheDocument();
    expect(screen.getByText('Activa ahora: ES v0 · EN v0.')).toBeInTheDocument();
  });

  it('T394 (page): ?v=N shows that snapshot; a v that does not exist is a friendly 404 next to the list; a v that is not a number is ignored and never sent', async () => {
    const api = await boot();
    addVersion(api, 'Servicio renovado', null);
    const shown = render(await page('services', { v: '1' }));
    const region = screen.getByRole('region', { name: 'Versión 1 · Español' });
    expect(region).toHaveTextContent('Si la restauras, esto cambia frente a la activa (v2):');
    expect(region).toHaveTextContent('Modificados: servicio-ejemplo (Título)');
    expect(region).toHaveTextContent('Inicial');
    shown.unmount();

    const missing = render(await page('services', { v: '9' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La versión 9 no existe en español. Elige otra de la lista.');
    expect(screen.getByRole('list', { name: 'Versiones en español' })).toBeInTheDocument();
    missing.unmount();

    const before = (api.admin?.state.received ?? []).length;
    for (const v of ['abc', '0', '-1', '1.5', '99999999999', '../1']) {
      const view = render(await page('services', { v }));
      expect(screen.queryByRole('region', { name: /^Versión / })).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      view.unmount();
    }
    const asked = (api.admin?.state.received ?? []).slice(before).map((entry) => entry.path);
    expect(asked.filter((path) => /\/versions\/./.test(path))).toEqual([]);
  });

  it('extra (AC23): skeleton while loading; a failed read shows a Spanish error with a reference and a retry; a 401 goes to the login with the page as next', async () => {
    const { unmount } = render(<HistoryLoading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    unmount();

    const api = await boot();
    api.admin?.inject('versions.list', { mode: '500' });
    const failed = render(await page('services', { lang: 'en' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/La API no está disponible.*Referencia: [0-9a-f]{32}/);
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/history\/services\/?\?lang=en$/));
    failed.unmount();

    session.token = 'fake.0.caducado';
    await page('services', { lang: 'en', v: '1' }).catch(() => undefined);
    expect(redirect).toHaveBeenCalledWith(`/admin/login/?expired=1&next=${encodeURIComponent('/admin/history/services/?lang=en&v=1')}`);
  });

  it('extra: the dashboard cards and the editors link to the history of their kind', async () => {
    await boot();
    render(await DashboardPage());
    for (const [name, kind] of [['Servicios', 'services'], ['Proyectos', 'projects'], ['Arquitectura', 'architecture']] as const) {
      const card = screen.getByRole('article', { name });
      expect(within(card).getByRole('link', { name: `Historial de ${name.toLowerCase()}` })).toHaveAttribute('href', expect.stringMatching(new RegExp(`^/admin/history/${kind}/?$`)));
    }
    render(await ServicesPage());
    expect(screen.getByRole('link', { name: 'Historial de versiones de servicios' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/history\/services\/?$/));
  });
});
