import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import { sample } from '@/tests/helpers/admin-content';
import type { AdminSeed } from '@/scripts/parity/admin-fake.mjs';
import DashboardPage from './page';

const session = vi.hoisted(() => ({ token: '' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers({ 'cf-connecting-ip': '203.0.113.7' }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), usePathname: () => '/admin/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function boot(seed: AdminSeed, extra: Parameters<typeof startAdminApi>[1] = {}) {
  const api = await startAdminApi({ seed }, extra);
  cleanups.push(api.restore);
  session.token = await freshToken(api);
  return api;
}

const card = (name: string) => screen.getByRole('article', { name });

describe('dashboard', () => {
  it('T334: each card shows ES/EN versions, the date in Spanish, the source, a parity badge and links', async () => {
    await boot({
      services: { es: sample('services.es'), en: sample('services.en') },
      architecture: { es: { core: { name: 'Núcleo' }, ports: [{ id: 'a', name: 'A', adapters: [{ id: 'x', name: 'X', status: 'production' }] }] }, en: { core: { name: 'Core' }, ports: [{ id: 'a', name: 'A', adapters: [{ id: 'x', name: 'X', status: 'experiment' }] }] } },
    });
    render(await DashboardPage());
    const services = card('Servicios');
    expect(within(services).getByText('ES v1 · EN v1')).toBeInTheDocument();
    expect(within(services).getByText('Inicial')).toBeInTheDocument();
    const time = services.querySelector('time') as HTMLTimeElement;
    expect(time.dateTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(time.textContent).toBe(new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time.dateTime)));
    expect(within(services).getByText('ES y EN coinciden')).toBeInTheDocument();
    expect(within(services).getByRole('link', { name: 'Editar servicios' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/services\/?$/));
    expect(within(card('Arquitectura')).getByText('1 diferencia entre ES y EN')).toBeInTheDocument();
    expect(within(card('Arquitectura')).getByRole('link', { name: 'Editar arquitectura' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/architecture\/?$/));
  });

  it('T335: a kind at version 0 says «Sin publicar todavía» with a CTA; a kind that fails (500) shows only its own card in error with a retry', async () => {
    // Only the projects document fails (both attempts of the read).
    await boot({}, { respond: (resource) => (resource === 'admin/content/projects' ? { status: 500, body: { code: 'UNEXPECTED', status: 500, title: 'x' } } : undefined) });
    render(await DashboardPage());
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(3);
    const failed = cards.filter((node) => node.getAttribute('data-state') === 'error');
    expect(failed).toHaveLength(1);
    const broken = failed[0] as HTMLElement;
    expect(broken).toHaveAccessibleName('Proyectos');
    expect(within(broken).getByRole('alert')).toHaveTextContent(/La API no está disponible/);
    expect(within(broken).getByRole('alert')).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
    expect(within(broken).getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/?$/));
    const healthy = cards.filter((node) => node !== broken);
    for (const node of healthy) expect(within(node).getByText('Sin publicar todavía')).toBeInTheDocument();
    expect(within(card('Servicios')).getByRole('link', { name: 'Publicar el primero' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/services\/?$/));
  });
});
