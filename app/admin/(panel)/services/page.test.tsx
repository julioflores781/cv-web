import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { freshToken, startAdminApi } from '@/tests/helpers/admin-routes';
import AdminError from '../../error';
import ServicesLoading from './loading';
import ServicesPage from './page';

const session = vi.hoisted(() => ({ token: '' }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (session.token && name.startsWith('cv_') ? { name, value: session.token } : undefined) }),
  headers: async () => new Headers(),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), usePathname: () => '/admin/services/' }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

describe('services screen states', () => {
  it('T338: loading.tsx is a skeleton with role=status and aria-busy; a GET 500 shows a Spanish error with reference and retry and no trace; error.tsx retries', async () => {
    const { unmount } = render(<ServicesLoading />);
    const skeleton = screen.getByRole('status');
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    expect(skeleton).toHaveTextContent('Servicios');
    unmount();

    const api = await startAdminApi();
    cleanups.push(api.restore);
    session.token = await freshToken(api);
    api.admin?.inject('content.get', { mode: '500' });
    const page = render(await ServicesPage());
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Error: La API no está disponible');
    expect(alert).toHaveTextContent(/Referencia: [0-9a-f]{32}/);
    expect(screen.getByRole('link', { name: 'Reintentar' })).toHaveAttribute('href', expect.stringMatching(/^\/admin\/services\/?$/));
    expect(page.container.innerHTML).not.toMatch(/127\.0\.0\.1|UNEXPECTED|stack|at \w+ \(/);
    page.unmount();

    const reset = vi.fn();
    render(<AdminError error={Object.assign(new Error('boom at secret.ts:1'), { digest: 'd1g3st' })} reset={reset} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Referencia: d1g3st');
    expect(document.body.textContent).not.toContain('boom');
    screen.getByRole('button', { name: 'Reintentar' }).click();
    expect(reset).toHaveBeenCalled();
  });
});
