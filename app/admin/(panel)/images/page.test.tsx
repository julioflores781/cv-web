import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import type { AdminFakeOptions } from '@/scripts/parity/admin-fake.mjs';
import ProjectsPage from '../projects/page';
import ImagesLoading from './loading';
import ImagesPage from './page';

const session = vi.hoisted(() => ({ token: '' }));
const redirect = vi.hoisted(() => vi.fn());
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect, usePathname: () => '/admin/images/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  redirect.mockReset();
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

const USED = 'site/projects/00000000-0000-4000-8000-000000000001.webp';
const OLD = 'site/projects/0000000b-0000-4000-8000-000000000000.png';

async function boot(options: AdminFakeOptions = {}) {
  const api = await startAdminApi({ seed: { projects: { es: sample('projects.es'), en: sample('projects.en') } }, ...options });
  cleanups.push(api.restore);
  session.token = await freshToken(api);
  return api;
}

const store = (api: Awaited<ReturnType<typeof boot>>, key: string) => {
  const id = /([0-9a-f-]{36})/.exec(key)?.[1] ?? '';
  api.admin?.state.images.set(id, { id, key, contentType: 'image/png', bytes: 2048, width: 10, height: 10, lastModified: Date.UTC(2026, 10, 1) });
};

describe('images screen', () => {
  it('T386: skeleton while loading; an empty storage says so; a 503 points to the runbook with a reference; other failures retry', async () => {
    const { unmount } = render(<ImagesLoading />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Imágenes');
    unmount();

    const api = await boot();
    const empty = render(await ImagesPage());
    expect(screen.getByRole('heading', { level: 1, name: 'Imágenes' })).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay imágenes. Se suben desde el editor de proyectos.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Limpiar imágenes huérfanas' })).toBeNull();
    empty.unmount();

    api.admin?.setStorage(false);
    const down = render(await ImagesPage());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error: El almacenamiento de imágenes no está disponible. Revisa la configuración de R2 de la API (docs/admin-runbook.md del repo cv).');
    expect(alert).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
    expect(down.container.innerHTML).not.toMatch(/127\.0\.0\.1|media\.example/);
    down.unmount();

    api.admin?.setStorage(true);
    api.admin?.inject('images.list', { mode: '500' });
    render(await ImagesPage());
    expect(screen.getByRole('alert')).toHaveTextContent('Error: La API no está disponible');
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/images\/?$/));
  });

  it('extra (T383): the page tells images of the published projects from images only an old version uses, and offers the cleanup', async () => {
    const api = await boot();
    store(api, USED);
    store(api, OLD);
    // An old version references OLD: publish one with it, then publish the sample again.
    const es = sample('projects.es') as { projects: Array<Record<string, unknown>> };
    const en = sample('projects.en') as { projects: Array<Record<string, unknown>> };
    const withOld = (doc: { projects: Array<Record<string, unknown>> }) => ({ projects: [{ ...doc.projects[0], images: [{ key: OLD, alt: 'Antigua', width: 10, height: 10 }] }, doc.projects[1]] });
    const put = (documents: unknown, base: number) =>
      fetch(`${api.url}/api/v1/admin/content/projects`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ baseVersions: { es: base, en: base }, documents }),
      });
    expect((await put({ es: withOld(es), en: withOld(en) }, 1)).status).toBe(200);
    expect((await put({ es, en }, 2)).status).toBe(200);

    render(await ImagesPage());
    const card = (name: string) => screen.getByText(name, { selector: 'p' }).closest('li') as HTMLElement;
    expect(within(card('00000000….webp')).getByText('En uso')).toBeInTheDocument();
    expect(card('0000000b….png')).toHaveTextContent('En uso (versión antigua)');
    expect(screen.getByRole('heading', { name: 'Limpiar imágenes huérfanas' })).toBeInTheDocument();
  });

  it('extra (T380): the projects editor gets the listing: thumbnails of stored keys, and a notice when the storage is down', async () => {
    const api = await boot();
    store(api, USED);
    const page = render(await ProjectsPage());
    const thumbs = page.container.querySelectorAll('img');
    expect([...thumbs].map((img) => img.getAttribute('src'))).toEqual([`https://media.example.test/${USED}`]);
    page.unmount();

    api.admin?.setStorage(false);
    const down = render(await ProjectsPage());
    expect(down.container).toHaveTextContent('El almacenamiento de imágenes no está disponible: no se ven las miniaturas');
    expect(down.container.querySelectorAll('img')).toHaveLength(0);
  });
});
