import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readText } from '@/tests/helpers/css';
import { AdminShell } from './admin-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/settings/' }));

const ITEMS = [
  { href: '/admin/', label: 'Inicio' },
  { href: '/admin/settings/', label: 'Ajustes' },
];

describe('AdminShell', () => {
  it('T277: skip link, header, a labelled nav with aria-current, a main with id, a logout button and 44 px targets', () => {
    render(
      <AdminShell items={ITEMS}>
        <h1>Ajustes</h1>
      </AdminShell>,
    );
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido');
    expect(screen.getByRole('banner')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getAllByRole('link')).toHaveLength(2);
    expect(within(nav).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();

    const css = readText('components/admin/admin-shell.module.css');
    // skip link and nav links here, the logout button in session-actions.module.css
    expect(readText('components/admin/session-actions.module.css')).toMatch(/min-height:\s*44px/);
    expect(css.match(/min-height:\s*44px/g)?.length).toBeGreaterThanOrEqual(2);
    // Keyboard operable on mobile: the nav is plain links that wrap, never a hover-only menu.
    expect(css).not.toMatch(/:hover\s*>\s*|display:\s*none/);
  });
});
