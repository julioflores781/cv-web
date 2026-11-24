import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EMPTY_ARCHITECTURE, projectsEs, sampleImage, servicesEs } from '@/tests/fixtures/content';
import { emptyListsResume, minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import type { Resume } from '@/lib/api/types';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { HomeView } from './home-view';

const SITE = 'https://cv.example.test';

function numbers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('section h2'))
    .map((h2) => h2.closest('section')?.querySelector('p')?.textContent ?? '')
    .filter((text) => /^\d{2} \//.test(text));
}

const hrefsOf = (container: HTMLElement) => Array.from(container.querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href') as string);

const NO_EDUCATION = { education: [], certificates: [], courses: [] };
const PROFILE_NUMBERS = {
  es: ['01 / trayectoria', '02 / formación', '03 / arquitectura', '04 / proyectos', '05 / contacto'],
  en: ['01 / career', '02 / education', '03 / architecture', '04 / projects', '05 / contact'],
};
const SERVICES_NUMBERS = {
  es: ['01 / servicios', '02 / proceso', '03 / proyectos', '04 / contacto'],
  en: ['01 / services', '02 / process', '03 / projects', '04 / contact'],
};

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

  it('BA-A9: the profile has impact, career, education, architecture with stack and contact; services shows nothing of the profile', () => {
    const profile = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    expect(profile.container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Impacto' })).toBeInTheDocument();
    expect(profile.container.querySelector('#architecture')).not.toBeNull();
    expect(profile.container.textContent).toContain('Lenguaje Uno');
    // Extended in web-trajectory-split: experience and education are two sections of the profile.
    for (const present of ['#experience', '#education']) expect(profile.container.querySelector(present), present).not.toBeNull();
    profile.unmount();
    const services = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'services' }} siteUrl={SITE} />);
    for (const absent of ['#experience', '#education', '#architecture']) expect(services.container.querySelector(absent), absent).toBeNull();
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
    expect(Array.from(screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('[data-probe="navlinks"]')).map((a) => a.getAttribute('href'))).toEqual(['#projects', '#contact']);
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

  it('TR-T14 (BA-T37, T47, CO-T81): the profile numbers 01 career · 02 education · 03 architecture · 04 projects · 05 contact in ES and EN, also with services, projects and architecture empty; services keeps 01-04', () => {
    for (const empty of EMPTY_MATRIX) {
      for (const lang of ['es', 'en'] as const) {
        for (const page of ['profile', 'services'] as const) {
          const { container, unmount } = renderEmpty(empty, { lang, page });
          expect(numbers(container), JSON.stringify({ empty, lang, page })).toEqual(page === 'profile' ? PROFILE_NUMBERS[lang] : SERVICES_NUMBERS[lang]);
          unmount();
        }
      }
    }
    // Kept from CO-T81: the services page with services has its aside and the nav keeps projects and contact; the profile has neither aside nor selection line.
    const props = { resume: resumeEs, siteUrl: SITE, services: servicesEs, projects: projectsEs };
    const services = render(<HomeView {...props} route={{ lang: 'es', page: 'services' }} />);
    expect(services.container.querySelector('aside')).not.toBeNull();
    expect(Array.from(screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('[data-probe="navlinks"]')).map((a) => a.getAttribute('href'))).toEqual(['#projects', '#contact']);
    services.unmount();
    const profile = render(<HomeView {...props} route={{ lang: 'es', page: 'profile' }} />);
    expect(numbers(profile.container)).toEqual(PROFILE_NUMBERS.es);
    expect(profile.container.querySelector('aside, [data-probe="selection-line"]')).toBeNull();
  });

  it('TR-T15: a missing experience or education renumbers the profile without gaps, and blank-only education is no section', () => {
    const profile = (resume: Resume) => render(<HomeView resume={resume} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    const withoutJobs = profile({ ...resumeEs, experience: [] });
    expect(numbers(withoutJobs.container)).toEqual(['01 / formación', '02 / arquitectura', '03 / proyectos', '04 / contacto']);
    expect(withoutJobs.container.querySelector('#experience')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ver trayectoria' })).toBeNull();
    withoutJobs.unmount();

    const withoutEducation = profile({ ...resumeEs, education: NO_EDUCATION });
    expect(numbers(withoutEducation.container)).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / proyectos', '04 / contacto']);
    expect(withoutEducation.container.querySelector('#education')).toBeNull();
    expect(screen.getByRole('link', { name: 'Ver trayectoria' })).toHaveAttribute('href', '#experience');
    withoutEducation.unmount();

    const empty = profile(emptyListsResume());
    expect(numbers(empty.container)).toEqual(['01 / arquitectura', '02 / proyectos', '03 / contacto']);
    empty.unmount();

    const blank = profile({
      ...resumeEs,
      education: { education: [{ institution: ' ', studyType: ' ' }], certificates: [{ name: '  ', issuer: 'Entidad Ejemplo' }], courses: [{ name: '' }] },
    });
    expect(blank.container.querySelector('#education')).toBeNull();
    expect(numbers(blank.container)).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / proyectos', '04 / contacto']);
  });

  it('TR-T16: the services page (ES and EN, resumeEs) has no #experience, #education, phases, achievements nor education, and keeps 01 services · 02 process · 03 projects · 04 contact', () => {
    for (const lang of ['es', 'en'] as const) {
      const dict = getDictionary(lang);
      const { container, unmount } = render(<HomeView resume={resumeEs} services={servicesEs} projects={projectsEs} route={{ lang, page: 'services' }} siteUrl={SITE} />);
      for (const absent of ['#experience', '#education', 'details', 'summary']) expect(container.querySelector(absent), `${lang} ${absent}`).toBeNull();
      const text = container.textContent ?? '';
      const [phase] = resumeEs.experience[0]?.phases ?? [];
      const leaks = [
        phase?.title as string,
        ...resumeEs.experience.flatMap((job) => job.highlights),
        'Ver logros',
        'See achievements',
        'Universidad Ejemplo',
        'Certificado Ejemplo',
        'Curso Ejemplo',
        dict.sections.education.title,
        dict.education.degrees,
      ];
      for (const leak of leaks) expect(text, `${lang} ${leak}`).not.toContain(leak);
      expect(numbers(container), lang).toEqual(SERVICES_NUMBERS[lang]);
      unmount();
    }
  });

  it('TR-T17: the full profile has one h1, #experience and #education labelled by their h2, h3 for jobs and columns with no h4 nor skipped level, and every #anchor (also «Ver trayectoria») resolves', () => {
    const { container } = render(<HomeView resume={resumeEs} services={servicesEs} projects={projectsEs} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} />);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    for (const id of ['experience', 'education']) {
      const section = container.querySelector(`section#${id}[aria-labelledby]`);
      expect(section, id).not.toBeNull();
      const h2 = section?.querySelector('h2');
      expect(h2?.id, id).toBe(section?.getAttribute('aria-labelledby'));
      expect(section?.querySelectorAll('h3').length, id).toBeGreaterThan(0);
      expect(section?.querySelector('h4, h5, h6'), id).toBeNull();
    }
    expect(container.querySelectorAll('#experience h3')).toHaveLength(resumeEs.experience.length);
    expect(container.querySelectorAll('#education h3')).toHaveLength(3);
    const levels = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((heading) => Number(heading.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    levels.forEach((level, i) => {
      if (i > 0) expect(level, `heading ${i}`).toBeLessThanOrEqual((levels[i - 1] as number) + 1);
    });
    const cta = screen.getByRole('link', { name: 'Ver trayectoria' });
    expect(cta).toHaveAttribute('href', '#experience');
    const anchors = hrefsOf(container);
    expect(anchors).toContain('#experience');
    for (const href of anchors) expect(container.querySelector(href), href).not.toBeNull();
  });

  it('T415: HomeView and Projects take no projectImages / images map any more; the cover comes with each project, on both pages', () => {
    for (const file of ['home-view.tsx', 'projects.tsx']) {
      const source = readFileSync(path.join(__dirname, file), 'utf8');
      expect(source, file).not.toMatch(/projectImages|images=\{|images:\s*Readonly/);
    }
    const [own, ...rest] = projectsEs;
    const projects = [{ ...(own as (typeof projectsEs)[number]), images: [sampleImage(1)] }, ...rest];
    for (const page of ['profile', 'services'] as const) {
      const { container, unmount } = render(<HomeView resume={resumeEs} services={servicesEs} projects={projects} route={{ lang: 'es', page }} siteUrl={SITE} />);
      const images = Array.from(container.querySelectorAll('#projects img'));
      expect(images.map((img) => img.getAttribute('src')), page).toEqual([sampleImage(1).url]);
      unmount();
    }
  });
});
