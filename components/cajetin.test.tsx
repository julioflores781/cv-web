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
  it('HS-T12 (BA-T27, BA-T28, BA-T29): services is sheet «01 / 02 · Servicios» and the profile «02 / 02 · Perfil» (EN: Sheet … · Services / Profile); the other cells do not change', () => {
    // BA-T27: a full profile has 5 cells: author, specialty (tagline), active since (earliest year), location and sheet.
    expect(cells(resumeEs.profile, resumeEs.experience, profileRoute)).toEqual({
      Autor: 'Ada Ejemplo',
      Especialidad: resumeEs.profile.tagline,
      'En activo desde': '2010',
      Ubicación: 'Ciudad Ejemplo, España',
      Hoja: '02 / 02 · Perfil',
    });
    // BA-T28: without tagline, experience or city only those cells are omitted, and the specialty falls back to the label.
    const profile = { ...resumeEs.profile, tagline: null, city: null, countryCode: null };
    expect(cells(profile, [], profileRoute)).toEqual({
      Autor: 'Ada Ejemplo',
      Especialidad: resumeEs.profile.label,
      Hoja: '02 / 02 · Perfil',
    });
    const onlyCity = { ...resumeEs.profile, countryCode: 'XX' };
    expect(cells(onlyCity, resumeEs.experience, profileRoute).Ubicación).toBe('Ciudad Ejemplo');
    // BA-T29: the sheet of each page, in both languages, with the same other cells.
    const servicesEs = cells(resumeEs.profile, resumeEs.experience, { lang: 'es', page: 'services' });
    expect(servicesEs).toEqual({ ...cells(resumeEs.profile, resumeEs.experience, profileRoute), Hoja: '01 / 02 · Servicios' });
    const servicesEn = cells(resumeEn.profile, resumeEn.experience, { lang: 'en', page: 'services' });
    expect(servicesEn.Sheet).toBe('01 / 02 · Services');
    expect(servicesEn.Location).toBe('Example City, Spain');
    const profileEn = cells(resumeEn.profile, resumeEn.experience, { lang: 'en', page: 'profile' });
    expect(profileEn).toEqual({ ...servicesEn, Sheet: '02 / 02 · Profile' });
  });
});
