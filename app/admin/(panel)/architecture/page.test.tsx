import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import type { AdminSeed } from '@/scripts/parity/admin-fake.mjs';
import DashboardPage from '../page';
import ArchitectureLoading from './loading';
import ArchitecturePage from './page';

const session = vi.hoisted(() => ({ token: '' }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/admin/architecture/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

async function boot(seed: AdminSeed = {}) {
  const api = await startAdminApi({ seed });
  cleanups.push(api.restore);
  session.token = await freshToken(api);
  return api;
}

describe('architecture screen', () => {
  it('T365: the screen has its loading skeleton, the editor with the stored hexagon, an error with reference and retry, and the empty state at version 0', async () => {
    const { unmount } = render(<ArchitectureLoading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Arquitectura');
    unmount();

    const api = await boot({ architecture: { es: sample('architecture.es'), en: sample('architecture.en') } });
    const page = render(await ArchitecturePage());
    expect(screen.getByRole('heading', { level: 1, name: 'Arquitectura' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Base de datos/, expanded: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Colas/, expanded: false })).toBeInTheDocument();
    expect(page.container.querySelector('[data-preview]')).toHaveTextContent('Dominio');
    page.unmount();

    api.admin?.inject('content.get', { mode: '500' });
    const failed = render(await ArchitecturePage());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error: La API no está disponible');
    expect(alert).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/architecture\/?$/));
    expect(failed.container.innerHTML).not.toMatch(/127\.0\.0\.1|UNEXPECTED/);
    failed.unmount();

    await boot();
    render(await ArchitecturePage());
    expect(screen.getByText('Todavía no hay puertos publicados.')).toBeInTheDocument();
  });

  it('extra: the dashboard card of the architecture links to its editor and the navigation has it', async () => {
    await boot({ architecture: { es: sample('architecture.es'), en: sample('architecture.en') } });
    render(await DashboardPage());
    const card = screen.getByRole('article', { name: 'Arquitectura' });
    expect(within(card).getByRole('link', { name: 'Editar arquitectura' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/architecture\/?$/));
    expect(within(card).queryByText('Su editor llegará pronto.')).toBeNull();
    const { ADMIN_NAV } = await import('@/lib/admin/nav');
    expect(ADMIN_NAV.map((item) => item.href)).toEqual(['/admin/', '/admin/services/', '/admin/projects/', '/admin/architecture/', '/admin/images/', '/admin/messages/', '/admin/settings/']);
  });
});
