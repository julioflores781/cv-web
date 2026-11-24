// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyListsResume, minimalResume, resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { isResume, parseResume } from './validate';

describe('isResume', () => {
  it('T10: accepts the complete fixture', () => {
    expect(isResume(resumeEs)).toBe(true);
    expect(isResume(resumeEn)).toBe(true);
  });

  it('T11: accepts the minimal fixture (optional fields absent or null)', () => {
    expect(isResume(minimalResume('es'))).toBe(true);
    expect(isResume(minimalResume('en'))).toBe(true);
    expect(isResume(emptyListsResume())).toBe(true);
  });

  it('T12: rejects null, arrays, strings and a numeric profile.name', () => {
    expect(isResume(null)).toBe(false);
    expect(isResume([])).toBe(false);
    expect(isResume('resume')).toBe(false);
    expect(isResume({ ...resumeEs, profile: { ...resumeEs.profile, name: 42 } })).toBe(false);
  });

  it('extra: rejects an unknown language and malformed nested items', () => {
    expect(isResume({ ...resumeEs, language: 'fr' })).toBe(false);
    expect(isResume({ ...resumeEs, impact: [{ value: '1' }] })).toBe(false);
    expect(isResume({ ...resumeEs, experience: [{ ...resumeEs.experience[0], period: { start: '2020' } }] })).toBe(
      false,
    );
  });
});

describe('parseResume', () => {
  it('T13: drops unknown fields such as phone and birthDate', () => {
    const dirty = {
      ...resumeEs,
      phone: '+00 000',
      birthDate: '1900-01-01',
      profile: { ...resumeEs.profile, dni: 'X-0000' },
      contact: { ...resumeEs.contact, phone: '+00 000' },
    };
    const parsed = parseResume(dirty);
    expect(parsed).toEqual(resumeEs);
    const text = JSON.stringify(parsed);
    expect(text).not.toContain('+00 000');
    expect(text).not.toContain('1900-01-01');
    expect(text).not.toContain('X-0000');
  });
});

describe('parseResume: phases and highlights', () => {
  /** resumeEs with its first job replaced by `job` (built over the original one). */
  const withFirstJob = (job: (original: Record<string, unknown>) => Record<string, unknown>) => {
    const [first, ...rest] = resumeEs.experience;
    return { ...resumeEs, experience: [job({ ...first }), ...rest] };
  };
  const omit = (job: Record<string, unknown>, key: string) => {
    const copy = { ...job };
    delete copy[key];
    return copy;
  };

  it('TR-T21: a phase without title, a numeric client, phases absent or not a list, a numeric highlight or highlights absent → null; client null or absent is accepted; unknown fields in a phase or a job are dropped', () => {
    const invalid: Record<string, unknown> = {
      'phase without title': withFirstJob((job) => ({ ...job, phases: [{ client: 'Cliente Ejemplo' }] })),
      'numeric client': withFirstJob((job) => ({ ...job, phases: [{ title: 'Fase uno', client: 7 }] })),
      'phases absent': withFirstJob((job) => omit(job, 'phases')),
      'phases as an object': withFirstJob((job) => ({ ...job, phases: {} })),
      'numeric highlight': withFirstJob((job) => ({ ...job, highlights: ['Logro ficticio', 3] })),
      'highlights absent': withFirstJob((job) => omit(job, 'highlights')),
    };
    for (const [name, raw] of Object.entries(invalid)) expect(parseResume(raw), name).toBeNull();

    const nullClient = parseResume(withFirstJob((job) => ({ ...job, phases: [{ title: 'Fase uno', client: null }] })));
    expect(nullClient?.experience[0]?.phases).toEqual([{ title: 'Fase uno', client: null }]);
    const noClient = parseResume(withFirstJob((job) => ({ ...job, phases: [{ title: 'Fase uno' }] })));
    expect(noClient?.experience[0]?.phases).toEqual([{ title: 'Fase uno' }]);

    const dirty = parseResume(withFirstJob((job) => ({ ...job, dni: 'SENTINEL-DNI-0000', phases: [{ title: 'Fase uno', client: 'Cliente Ejemplo', phone: '+00-SENTINEL-0000' }] })));
    expect(dirty).toEqual(resumeEs);
    const text = JSON.stringify(dirty);
    expect(text).not.toContain('SENTINEL');
    expect(text).not.toMatch(/"(?:dni|phone)"/);
  });
});
