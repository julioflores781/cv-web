import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { projectsEs, servicesEs } from '@/tests/fixtures/content';
import { emptyListsResume, minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { HomeView } from './home-view';

const SITE = 'https://cv.example.test';

function numbers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('section h2'))
    .map((h2) => h2.closest('section')?.querySelector('p')?.textContent ?? '')
    .filter((text) => /^\d{2} \//.test(text));
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
        const { container, unmount } = render(<HomeView resume={resume} route={{ lang: 'es', page }} siteUrl={SITE} apiUrl="http://api.example.test" />);
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
    const full = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} apiUrl="http://api.example.test" />);
    expect(numbers(full.container)).toEqual(['01 / trayectoria', '02 / arquitectura', '03 / contacto']);
    full.unmount();
    const withoutJobs = render(<HomeView resume={emptyListsResume()} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} apiUrl="http://api.example.test" />);
    expect(numbers(withoutJobs.container)).toEqual(['01 / arquitectura', '02 / contacto']);
    withoutJobs.unmount();
    const services = render(<HomeView resume={resumeEn} route={{ lang: 'en', page: 'services' }} siteUrl={SITE} apiUrl="http://api.example.test" />);
    expect(numbers(services.container)).toEqual(['01 / process', '02 / contact']);
  });

  it('BA-A9: the profile has impact, career, architecture with stack and contact; services shows nothing of the profile', () => {
    const profile = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'profile' }} siteUrl={SITE} apiUrl="http://api.example.test" />);
    expect(profile.container.querySelectorAll('h1')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Impacto' })).toBeInTheDocument();
    expect(profile.container.querySelector('#architecture')).not.toBeNull();
    expect(profile.container.textContent).toContain('Lenguaje Uno');
    profile.unmount();
    const services = render(<HomeView resume={resumeEs} route={{ lang: 'es', page: 'services' }} siteUrl={SITE} apiUrl="http://api.example.test" />);
    for (const absent of ['#experience', '#architecture']) expect(services.container.querySelector(absent)).toBeNull();
    expect(services.container.textContent).not.toContain('Lenguaje Uno');
    expect(screen.queryByRole('region', { name: 'Impacto' })).toBeNull();
    expect(services.container.querySelector('#contact')).not.toBeNull();
  });

  it('extra: one h1 and the banner, navigation, main and contentinfo landmarks on the four pages', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const page of ['profile', 'services'] as const) {
        const resume = lang === 'es' ? resumeEs : resumeEn;
        const { unmount } = render(<HomeView resume={resume} route={{ lang, page }} siteUrl={SITE} apiUrl="http://api.example.test" />);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('navigation')).toBeInTheDocument();
        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
        unmount();
      }
    }
  });

  it('CO-T18: an empty services list leaves no section, nav link nor aside; the projects link only exists with projects', () => {
    const { container } = render(
      <HomeView resume={resumeEs} services={[]} projects={[]} route={{ lang: 'es', page: 'services' }} siteUrl={SITE} apiUrl="http://api.example.test" />,
    );
    expect(container.querySelector('#services')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
    expect(container.querySelector('#projects')).toBeNull();
    expect(Array.from(screen.getByRole('navigation', { name: 'Principal' }).querySelectorAll('a[href^="#"]')).map((a) => a.getAttribute('href'))).toEqual(['#contact']);
  });

  it('CO-T81 (component level): sections are numbered by render order and absent ones renumber', () => {
    const props = { resume: resumeEs, siteUrl: SITE, apiUrl: 'http://api.example.test' };
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
    expect(numbers(bare.container)).toEqual(['01 / proceso', '02 / contacto']);
  });
});
