import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { routePath, type Route } from '@/lib/i18n/routes';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { HomeView } from './home-view';
import { SiteHeader } from './site-header';

const links = [{ href: '#contact', label: 'contacto' }];
const ROUTES: Route[] = (['es', 'en'] as const).flatMap((lang) => (['services', 'profile'] as const).map((page) => ({ lang, page })));

function renderHeader(route: Route, name = 'Ada Ejemplo') {
  return render(<SiteHeader route={route} name={name} links={links} dict={getDictionary(route.lang)} />);
}

describe('SiteHeader with empty sections', () => {
  it('T46: the header of the 4 pages built by HomeView with empty lists links #projects and #contact, labelled in its language', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const page of ['profile', 'services'] as const) {
        const dict = getDictionary(lang);
        const { container, unmount } = render(
          <HomeView resume={lang === 'es' ? resumeEs : resumeEn} services={[]} projects={[]} route={{ lang, page }} siteUrl="https://cv.example.test" />,
        );
        const nav = within(container.querySelector('nav') as HTMLElement);
        expect(nav.getByRole('link', { name: dict.nav.projects })).toHaveAttribute('href', '#projects');
        expect(nav.getByRole('link', { name: dict.nav.contact })).toHaveAttribute('href', '#contact');
        unmount();
      }
    }
  });
});

describe('SiteHeader', () => {
  it('HS-T7 (BA-T20): the toggle lists Servicios before Perfil / CV, links both pages of the language and marks the current one with aria-current', () => {
    const { unmount } = renderHeader({ lang: 'es', page: 'services' });
    const group = screen.getByRole('group', { name: 'Modo de la web' });
    const segments = within(group).getAllByRole('link');
    expect(segments.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Servicios', '/'],
      ['Perfil / CV', '/perfil/'],
    ]);
    expect(segments[0]).toHaveAttribute('aria-current', 'page');
    expect(segments[1]).not.toHaveAttribute('aria-current');
    unmount();

    renderHeader({ lang: 'en', page: 'profile' });
    const english = within(screen.getByRole('group', { name: 'Site mode' }));
    expect(english.getAllByRole('link').map((link) => link.textContent)).toEqual(['Services', 'Profile / CV']);
    expect(english.getByRole('link', { name: 'Services' })).toHaveAttribute('href', '/en/');
    expect(english.getByRole('link', { name: 'Services' })).not.toHaveAttribute('aria-current');
    expect(english.getByRole('link', { name: 'Profile / CV' })).toHaveAttribute('href', '/en/profile/');
    expect(english.getByRole('link', { name: 'Profile / CV' })).toHaveAttribute('aria-current', 'page');
  });

  it('HS-T8 (BA-T21, logo): the logo goes to #inicio on the services pages and to the services page of the language from the profile', () => {
    const expected: Array<[Route, string]> = [
      [{ lang: 'es', page: 'services' }, '#inicio'],
      [{ lang: 'en', page: 'services' }, '#inicio'],
      [{ lang: 'es', page: 'profile' }, '/'],
      [{ lang: 'en', page: 'profile' }, '/en/'],
    ];
    for (const [route, href] of expected) {
      const { unmount } = renderHeader(route);
      expect(screen.getByRole('link', { name: 'Ada Ejemplo' }), `${route.lang} ${route.page}`).toHaveAttribute('href', href);
      unmount();
    }
  });

  it('HS-T9: on the 4 pages the profile segment is «Perfil / CV» / «Profile / CV», links the profile of the language (aria-current only there) and is the header’s only link to it', () => {
    for (const route of ROUTES) {
      const label = `${route.lang} ${route.page}`;
      const dict = getDictionary(route.lang);
      const profilePath = routePath({ lang: route.lang, page: 'profile' });
      const { container, unmount } = render(<HomeView resume={route.lang === 'es' ? resumeEs : resumeEn} route={route} siteUrl="https://cv.example.test" />);
      const header = container.querySelector('header') as HTMLElement;
      const segment = within(within(header).getByRole('group', { name: dict.header.modeLabel })).getByRole('link', { name: route.lang === 'es' ? 'Perfil / CV' : 'Profile / CV' });
      expect(segment, label).toHaveAttribute('href', profilePath);
      if (route.page === 'profile') expect(segment, label).toHaveAttribute('aria-current', 'page');
      else expect(segment, label).not.toHaveAttribute('aria-current');
      // No other link of the header leads to the profile of the page's language.
      expect(Array.from(header.querySelectorAll(`a[href="${profilePath}"]`)), label).toEqual([segment]);
      // The only other profile URL in the header is the language switch on the profile itself (same page, other language).
      const otherProfile = header.querySelectorAll('a[href="/perfil/"], a[href="/en/profile/"]');
      const switches = Array.from(otherProfile).filter((link) => link !== segment);
      expect(switches.every((link) => link.hasAttribute('hreflang') && link.getAttribute('hreflang') !== route.lang), label).toBe(true);
      expect(switches, label).toHaveLength(route.page === 'profile' ? 1 : 0);
      unmount();
    }
  });

  it('HS-T10 (BA-T21, language): the language switch links the same page in the other language with hreflang', () => {
    const { unmount } = renderHeader({ lang: 'es', page: 'services' });
    const other = within(screen.getByRole('group', { name: 'Idioma' })).getByRole('link', { name: 'EN' });
    expect(other).toHaveAttribute('href', '/en/');
    expect(other).toHaveAttribute('hreflang', 'en');
    expect(within(screen.getByRole('group', { name: 'Idioma' })).getByText('ES')).toHaveAttribute('aria-current', 'true');
    unmount();

    renderHeader({ lang: 'en', page: 'profile' });
    const spanish = within(screen.getByRole('group', { name: 'Language' })).getByRole('link', { name: 'ES' });
    expect(spanish).toHaveAttribute('href', '/perfil/');
    expect(spanish).toHaveAttribute('hreflang', 'es');
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
