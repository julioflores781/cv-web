import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Route } from '@/lib/i18n/routes';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import type { Experience, Profile } from '@/lib/api/types';
import { Cajetin } from './cajetin';

function cells(profile: Profile, experience: Experience[], route: Route): Record<string, string> {
  const { container } = render(<Cajetin profile={profile} experience={experience} route={route} dict={getDictionary(route.lang)} />);
  const terms = Array.from(container.querySelectorAll('dt')).map((dt) => dt.textContent ?? '');
  const values = Array.from(container.querySelectorAll('dd')).map((dd) => dd.textContent ?? '');
  expect(container.querySelector('dl')).not.toBeNull();
  return Object.fromEntries(terms.map((term, i) => [term, values[i] ?? '']));
}

const profileRoute = { lang: 'es', page: 'profile' } as const;

describe('Cajetin', () => {
  it('BA-T27: a full profile has 5 cells: author, specialty (tagline), active since (earliest year), location and sheet', () => {
    expect(cells(resumeEs.profile, resumeEs.experience, profileRoute)).toEqual({
      Autor: 'Ada Ejemplo',
      Especialidad: resumeEs.profile.tagline,
      'En activo desde': '2010',
      Ubicación: 'Ciudad Ejemplo, España',
      Hoja: '01 / 02 · Perfil',
    });
  });

  it('BA-T28: without tagline, experience or city only those cells are omitted, and the specialty falls back to the label', () => {
    const profile = { ...resumeEs.profile, tagline: null, city: null, countryCode: null };
    expect(cells(profile, [], profileRoute)).toEqual({
      Autor: 'Ada Ejemplo',
      Especialidad: resumeEs.profile.label,
      Hoja: '01 / 02 · Perfil',
    });
    const onlyCity = { ...resumeEs.profile, countryCode: 'XX' };
    expect(cells(onlyCity, resumeEs.experience, profileRoute).Ubicación).toBe('Ciudad Ejemplo');
  });

  it('BA-T29: the services page is sheet «02 / 02 · Servicios» (EN: Sheet 02 / 02 · Services)', () => {
    expect(cells(resumeEs.profile, resumeEs.experience, { lang: 'es', page: 'services' }).Hoja).toBe('02 / 02 · Servicios');
    const english = cells(resumeEn.profile, resumeEn.experience, { lang: 'en', page: 'services' });
    expect(english.Sheet).toBe('02 / 02 · Services');
    expect(english.Location).toBe('Example City, Spain');
  });
});
