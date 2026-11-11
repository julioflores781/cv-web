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
