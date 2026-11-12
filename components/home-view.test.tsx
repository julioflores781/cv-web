import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EMPTY_ARCHITECTURE, projectsEs, servicesEs } from '@/tests/fixtures/content';
import { emptyListsResume, minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { HomeView } from './home-view';

const SITE = 'https://cv.example.test';

function numbers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('section h2'))
    .map((h2) => h2.closest('section')?.querySelector('p')?.textContent ?? '')
    .filter((text) => /^\d{2} \//.test(text));
}

const hrefsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href') as string);

/** Every combination of empty services / projects / architecture. */
const EMPTY_MATRIX = [false, true].flatMap((services) => [false, true].flatMap((projects) => [false, true].map((architecture) => ({ services, projects, architecture }))));

function renderEmpty(empty: { services: boolean; projects: boolean; architecture: boolean }, route: { lang: 'es' | 'en'; page: 'profile' | 'services' }) {
  return render(
    <HomeView
      resume={route.lang === 'es' ? resumeEs : resumeEn}
      services={empty.services ? [] : servicesEs}
      projects={empty.projects ? [] : projectsEs}
      architecture={empty.architecture ? EMPTY_ARCHITECTURE : null}
      route={route}
      siteUrl={SITE}
     
    />,
  );
}

describe('HomeView', () => {
  it('BA-T22: the header links only to anchors of rendered sections, in every combination of present and absent sections', () => {
    const resumes = [
      resumeEs,
      { ...resumeEs, experience: [], education: { education: [], certificates: [], courses: [] } },
      emptyListsResume(),
      minimalResume(),
    ];
    for (const resume of resumes) {
      for (const page of ['profile', 'services'] as const) {
        const { container, unmount } = render(<HomeView resume={resume} route={{ lang: 'es', page }} siteUrl={SITE} />);
        const nav = screen.getByRole('navigation', { name: 'Principal' });
        for (const link of Array.from(nav.querySelectorAll('a'))) {
          const href = link.getAttribute('href') ?? '';
          if (href.startsWith('#')) expect(container.querySelector(href), `${page} ${href}`).not.toBeNull();
        }
        unmount();
      }
    }
  });

  it('BA-T37: the section numbers are recalculated without gaps when a middle section is missing', () => {
    const full = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    expect(numbers(full.container)).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / proyectos', '04 / contacto']);
    full.unmount();
    const withoutJobs = render(<HomeView resume={emptyListsResume()} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    expect(numbers(withoutJobs.container)).toEqual(['01 / arquitectura', '02 / proyectos', '03 / contacto']);
    withoutJobs.unmount();
    const services = render(<HomeView resume={resumeEn} route={{ lang: 'en', page: 'services' }} siteUrl={SITE} />);
    expect(numbers(services.container)).toEqual(['01 / services', '02 / process', '03 / projects', '04 / contact']);
  });

  it('BA-A9: the profile has impact, career, architecture with stack and contact; services shows nothing of the profile', () => {
    const profile = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    expect(profile.container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Impacto' })).toBeInTheDocument();
    expect(profile.container.querySelector('#architecture')).not.toBeNull();
    expect(profile.container.textContent).toContain('Lenguaje Uno');
    profile.unmount();
    const services = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'services' }} siteUrl={SITE} />);
    for (const absent of ['#experience', '#architecture']) expect(services.container.querySelector(absent)).toBeNull();
    expect(services.container.textContent).not.toContain('Lenguaje Uno');
    expect(screen.queryByRole('region', { name: 'Impacto' })).toBeNull();
    expect(services.container.querySelector('#contact')).not.toBeNull();
  });

  it('extra: one h1 and the banner, navigation, main and contentinfo landmarks on the four pages', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const page of ['profile', 'services'] as const) {
        const resume = lang === 'es' ? resumeEs : resumeEn;
        const { unmount } = render(<HomeView resume={resume} route={{ lang, page }} siteUrl={SITE} />);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('navigation')).toBeInTheDocument();
        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
        unmount();
      }
    }
  });

  it('CO-T18 / T51: an empty services list leaves the section with its empty text and no aside nor selection; the nav keeps projects and contact', () => {
    const { container } = render(
      <HomeView resume={resumeEs} services={[]} projects={[]} route={{ lang: 'es', page: 'services' }} siteUrl={SITE} />,
    );
    expect(container.querySelector('#services')).not.toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('#projects')).not.toBeNull();
    expect(Array.from(screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href'))).toEqual(['#projects', '#contact']);
  });

  it('T43: the services page with services=[] has #services with its h2 and empty text, no cards, aside or selection, and the contact form', () => {
    for (const lang of ['es', 'en'] as const) {
      const dict = getDictionary(lang);
      const { container, unmount } = render(
        <HomeView resume={lang === 'es' ? resumeEs : resumeEn} services={[]} projects={projectsEs} route={{ lang, page: 'services' }} siteUrl={SITE} />,
      );
      const section = container.querySelector('#services') as HTMLElement;
      expect(section.querySelector('h2')?.textContent).toBe(dict.sections.services.title);
      expect(section).toHaveTextContent(dict.empty.services);
      expect(container.querySelector('[data-probe="service-card"]')).toBeNull();
      expect(container.querySelector('aside, [data-probe="selection-line"]')).toBeNull();
      expect(container.querySelector('input[type="checkbox"], [aria-pressed]')).toBeNull();
      expect(container.querySelector('#contact form')).not.toBeNull();
      unmount();
    }
  });

  it('T44: with projects=[] both pages have #projects with its h2 and the empty text, no featured card nor links inside', () => {
    for (const page of ['profile', 'services'] as const) {
      const { container, unmount } = renderEmpty({ services: false, projects: true, architecture: false }, { lang: 'en', page });
      const section = container.querySelector('#projects') as HTMLElement;
      expect(section.querySelector('h2')?.textContent).toBe(getDictionary('en').sections.projects.title);
      expect(section).toHaveTextContent(getDictionary('en').empty.projects);
      expect(section.querySelector('[data-probe="featured"], a, img')).toBeNull();
      unmount();
    }
  });

  it('T46: with every combination of empty services, projects and architecture the nav links #projects and #contact and no #anchor is broken, on the 4 pages', () => {
    for (const empty of EMPTY_MATRIX) {
      for (const lang of ['es', 'en'] as const) {
        for (const page of ['profile', 'services'] as const) {
          const { container, unmount } = renderEmpty(empty, { lang, page });
          const label = JSON.stringify({ empty, lang, page });
          const nav = within(screen.getByRole('navigation', { name: lang === 'es' ? 'Principal' : 'Main' }));
          expect(nav.getAllByRole('link').map((a) => a.getAttribute('href')), label).toEqual(expect.arrayContaining(['#projects', '#contact']));
          for (const href of hrefsOf(container)) expect(container.querySelector(href), `${label} ${href}`).not.toBeNull();
          unmount();
        }
      }
    }
  });

  it('T47: with services, projects and architecture empty the numbering is consecutive: services 01-04, profile 01-04 (career only with data)', () => {
    const all = { services: true, projects: true, architecture: true };
    for (const lang of ['es', 'en'] as const) {
      const services = renderEmpty(all, { lang, page: 'services' });
      expect(numbers(services.container)).toEqual(
        lang === 'es' ? ['01 / servicios', '02 / proceso', '03 / proyectos', '04 / contacto'] : ['01 / services', '02 / process', '03 / projects', '04 / contact'],
      );
      services.unmount();
      const profile = renderEmpty(all, { lang, page: 'profile' });
      expect(numbers(profile.container)).toEqual(
        lang === 'es' ? ['01 / trayectoria', '02 / arquitectura', '03 / proyectos', '04 / contacto'] : ['01 / career', '02 / architecture', '03 / projects', '04 / contact'],
      );
      profile.unmount();
    }
    const noJobs = render(
      <HomeView resume={emptyListsResume()} services={[]} projects={[]} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />,
    );
    expect(numbers(noJobs.container)).toEqual(['01 / arquitectura', '02 / proyectos', '03 / contacto']);
  });

  it('T48: each empty state sits in a section named by its h2, with no alert or live region of its own, and a single h1', () => {
    for (const page of ['profile', 'services'] as const) {
      const { container, unmount } = renderEmpty({ services: true, projects: true, architecture: true }, { lang: 'es', page });
      const states = Array.from(container.querySelectorAll('[data-probe="empty"]'));
      expect(states).toHaveLength(page === 'services' ? 3 : 2);
      for (const state of states) {
        expect(state.closest('[role="alert"], [aria-live]'), page).toBeNull();
        expect(state.getAttribute('role')).toBeNull();
        expect(state.getAttribute('aria-live')).toBeNull();
        const section = state.closest('section[aria-labelledby]');
        if (section) expect(section.querySelector(`#${section.getAttribute('aria-labelledby')}`)?.tagName).toBe('H2');
      }
      expect(container.querySelectorAll('h1')).toHaveLength(1);
      unmount();
    }
  });

  it('T51: the hero keeps its two-column layout when the plane is empty and the services page without services has no «Tu encargo» provider', () => {
    const { container } = renderEmpty({ services: true, projects: true, architecture: true }, { lang: 'es', page: 'services' });
    expect(container.querySelector('[data-probe="hero-inner"]')?.getAttribute('data-columns')).toBe('2');
    expect(container.querySelector('[data-probe="selection-line"]')).toBeNull();
  });

  it('CO-T81 (component level): sections are numbered by render order and absent ones renumber', () => {
    const props = { resume: resumeEs, siteUrl: SITE };
    const services = render(<HomeView {...props} services={servicesEs} projects={projectsEs} route={{ lang: 'es', page: 'services' }} />);
    expect(numbers(services.container)).toEqual(['01 / servicios', '02 / proceso', '03 / proyectos', '04 / contacto']);
    expect(services.container.querySelector('aside')).not.toBeNull();
    expect(Array.from(screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href'))).toEqual(['#projects', '#contact']);
    services.unmount();
    const profile = render(<HomeView {...props} services={servicesEs} projects={projectsEs} route={{ lang: 'es', page: 'profile' }} />);
    expect(numbers(profile.container)).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / proyectos', '04 / contacto']);
    expect(profile.container.querySelector('aside')).toBeNull();
    expect(profile.container.querySelector('[data-probe="selection-line"]')).toBeNull();
    profile.unmount();
    const bare = render(<HomeView {...props} services={[]} projects={[]} route={{ lang: 'es', page: 'services' }} />);
    expect(numbers(bare.container)).toEqual(['01 / servicios', '02 / proceso', '03 / proyectos', '04 / contacto']);
  });
});
