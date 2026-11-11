import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Route } from '@/lib/i18n/routes';
import { SiteHeader } from './site-header';

const links = [{ href: '#contact', label: 'contacto' }];

function renderHeader(route: Route, name = 'Ada Ejemplo') {
  return render(<SiteHeader route={route} name={name} links={links} dict={getDictionary(route.lang)} />);
}

describe('SiteHeader', () => {
  it('BA-T20: the toggle marks the current page with aria-current and links both pages of the language', () => {
    const { unmount } = renderHeader({ lang: 'es', page: 'profile' });
    const group = screen.getByRole('group', { name: 'Modo de la web' });
    const profile = within(group).getByRole('link', { name: 'Perfil' });
    const services = within(group).getByRole('link', { name: 'Servicios' });
    expect(profile).toHaveAttribute('aria-current', 'page');
    expect(profile).toHaveAttribute('href', '/');
    expect(services).not.toHaveAttribute('aria-current');
    expect(services).toHaveAttribute('href', '/servicios/');
    unmount();

    renderHeader({ lang: 'en', page: 'services' });
    const english = within(screen.getByRole('group', { name: 'Site mode' }));
    expect(english.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/en/');
    expect(english.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/en/services/');
    expect(english.getByRole('link', { name: 'Services' })).toHaveAttribute('aria-current', 'page');
  });

  it('BA-T21: the language switch links the same page in the other language with hreflang; the logo returns to the profile', () => {
    const { unmount } = renderHeader({ lang: 'es', page: 'services' });
    const other = within(screen.getByRole('group', { name: 'Idioma' })).getByRole('link', { name: 'EN' });
    expect(other).toHaveAttribute('href', '/en/services/');
    expect(other).toHaveAttribute('hreflang', 'en');
    expect(within(screen.getByRole('group', { name: 'Idioma' })).getByText('ES')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Ada Ejemplo' })).toHaveAttribute('href', '/');
    unmount();

    renderHeader({ lang: 'en', page: 'profile' });
    expect(within(screen.getByRole('group', { name: 'Language' })).getByRole('link', { name: 'ES' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Ada Ejemplo' })).toHaveAttribute('href', '#inicio');
  });

  it('BA-T23: the logo mark shows the initials: AE for «Ada Ejemplo», one letter for one word, a dash without name', () => {
    const marks: Array<[string, string]> = [['Ada Ejemplo', 'AE'], ['Ada María Ejemplo', 'AE'], ['Ada', 'A'], ['', '—'], ['   ', '—']];
    for (const [name, expected] of marks) {
      const { container, unmount } = renderHeader({ lang: 'es', page: 'profile' }, name);
      expect(container.querySelector('[data-probe="logo-mark"]')?.textContent, name).toBe(expected);
      unmount();
    }
  });

  it('extra: the nav is named, the logo link is named after the person and only the given anchors appear', () => {
    renderHeader({ lang: 'es', page: 'profile' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'contacto' })).toHaveAttribute('href', '#contact');
    expect(within(nav).queryByRole('link', { name: /proyectos/i })).toBeNull();
  });
});
