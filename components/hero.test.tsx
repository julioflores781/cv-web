import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Route } from '@/lib/i18n/routes';
import { minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import type { Profile } from '@/lib/api/types';
import { Hero } from './hero';

function renderHero(profile: Profile, route: Route, hasExperience = true) {
  return render(
    <Hero profile={profile} route={route} dict={getDictionary(route.lang)} hasExperience={hasExperience} />,
  );
}

describe('Hero', () => {
  it('BA-T24: the profile hero has one h1 from the dictionary, eyebrow label · country, summary as lead, a CTA to #contact and «Ver trayectoria» to #experience', () => {
    const { container } = renderHero(resumeEs.profile, { lang: 'es', page: 'profile' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(getDictionary('es').hero.profile.h1);
    expect(container.querySelector('[data-probe="eyebrow"]')?.textContent).toBe(`${resumeEs.profile.label} · España`);
    expect(container.querySelector('[data-probe="lead"]')?.textContent).toBe(resumeEs.profile.summary);
    expect(screen.getByRole('link', { name: 'Escríbeme' })).toHaveAttribute('href', '#contact');
    expect(screen.getByRole('link', { name: 'Ver trayectoria' })).toHaveAttribute('href', '#experience');
    expect(container.querySelector('section')).toHaveAttribute('id', 'inicio');
    expect(container.querySelector('section')).toHaveClass('gridbg');
  });

  it('BA-T24: the lead falls back to the tagline, and without either there is no empty paragraph; no experience → no «Ver trayectoria»', () => {
    const route = { lang: 'es', page: 'profile' } as const;
    const tagline = { ...resumeEs.profile, summary: null };
    expect(renderHero(tagline, route, false).container.querySelector('[data-probe="lead"]')?.textContent).toBe(resumeEs.profile.tagline);
    expect(screen.queryByRole('link', { name: 'Ver trayectoria' })).toBeNull();
    const bare = renderHero(minimalResume().profile, route, false).container;
    expect(bare.querySelector('[data-probe="lead"]')).toBeNull();
    expect(bare.querySelectorAll('p:empty')).toHaveLength(0);
  });

  it('BA-T25: the services hero has its own h1, eyebrow and lead from the dictionary and the «Pedir presupuesto» CTA to #contact', () => {
    const dict = getDictionary('es');
    const { container } = renderHero(resumeEs.profile, { lang: 'es', page: 'services' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(dict.hero.services.h1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toBe(dict.hero.profile.h1);
    expect(container.querySelector('[data-probe="eyebrow"]')?.textContent).toBe(dict.hero.services.eyebrow);
    expect(container.querySelector('[data-probe="lead"]')?.textContent).toBe(dict.hero.services.lead);
    expect(screen.getByRole('link', { name: 'Pedir presupuesto' })).toHaveAttribute('href', '#contact');
    expect(screen.queryByRole('link', { name: /trayectoria/i })).toBeNull();
    expect(container.textContent).not.toContain(resumeEs.profile.summary as string);
  });

  it('BA-T26: an unknown or missing country code leaves the country out of the eyebrow without throwing', () => {
    const profiles: Profile[] = [
      ...['XX', '', null, 'ESP', '1'].map((countryCode) => ({ ...resumeEn.profile, countryCode })),
      minimalResume('en').profile,
    ];
    for (const profile of profiles) {
      const { container, unmount } = renderHero(profile, { lang: 'en', page: 'profile' });
      expect(container.querySelector('[data-probe="eyebrow"]')?.textContent, String(profile.countryCode)).toBe(profile.label);
      unmount();
    }
    const spain = renderHero(resumeEn.profile, { lang: 'en', page: 'profile' }).container;
    expect(spain.querySelector('[data-probe="eyebrow"]')?.textContent).toBe(`${resumeEn.profile.label} · Spain`);
  });

  it('extra (PA): the services hero has «Ver proyectos» to #projects (the section always exists), the profile hero does not', () => {
    renderHero(resumeEs.profile, { lang: 'es', page: 'services' }, false);
    expect(screen.getByRole('link', { name: 'Ver proyectos' })).toHaveAttribute('href', '#projects');
    cleanup();
    renderHero(resumeEs.profile, { lang: 'es', page: 'profile' }, true);
    expect(screen.queryByRole('link', { name: 'Ver proyectos' })).toBeNull();
  });
});
