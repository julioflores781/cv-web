import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import type { AdminSeed } from '@/scripts/parity/admin-fake.mjs';
import DashboardPage from '../page';
import ProjectsLoading from './loading';
import ProjectsPage from './page';

const session = vi.hoisted(() => ({ token: '' }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/admin/projects/' }));

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

describe('projects screen', () => {
  it('extra (AC23): the page renders the stored projects in the editor; skeleton while loading; a GET 500 shows the error with reference and retry; version 0 is the empty state', async () => {
    const { unmount } = render(<ProjectsLoading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Proyectos');
    unmount();

    const api = await boot({ projects: { es: sample('projects.es'), en: sample('projects.en') } });
    const page = render(await ProjectsPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Proyectos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Proyecto público de ejemplo/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /^Proyecto anónimo de ejemplo/ })).toBeInTheDocument();
    page.unmount();

    api.admin?.inject('content.get', { mode: '500' });
    const failed = render(await ProjectsPage());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error: La API no está disponible');
    expect(alert).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/projects\/?$/));
    expect(failed.container.innerHTML).not.toMatch(/127\.0\.0\.1|UNEXPECTED/);
    failed.unmount();

    await boot();
    render(await ProjectsPage());
    expect(screen.getByText('Todavía no hay proyectos publicados.')).toBeInTheDocument();
  });

  it('extra: the dashboard card of projects now links to its editor', async () => {
    await boot({ projects: { es: sample('projects.es'), en: sample('projects.en') } });
    render(await DashboardPage());
    const card = screen.getByRole('article', { name: 'Proyectos' });
    expect(within(card).getByRole('link', { name: 'Editar proyectos' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/projects\/?$/));
    expect(within(card).queryByText('Su editor llegará pronto.')).toBeNull();
  });
});
