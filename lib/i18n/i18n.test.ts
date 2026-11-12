// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LANGS } from './config';
import { dictionaries } from './dictionaries';
import { earliestYear, formatCountry, formatPeriod, initials } from './format';

function flatten(value: unknown, prefix = ''): Array<[string, unknown]> {
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return [[prefix, value]];
}

// Markers of the design that must never be published (placeholders and unverified sample data).
const FORBIDDEN = /\[[^\]]*\]|TU PRECIO|AÑOS|OTRO PROYECTO|Astro|CAPTURA/;

describe('dictionaries', () => {
  it('BA-T42: ES and EN have the same keys, no empty string and no placeholder or sample-data marker', () => {
    const es = flatten(dictionaries.es);
    const en = flatten(dictionaries.en);
    expect(es.map(([key]) => key).sort()).toEqual(en.map(([key]) => key).sort());
    for (const [key, value] of [...es, ...en]) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim(), key).not.toBe('');
      expect(value as string, key).not.toMatch(FORBIDDEN);
    }
  });

  it('T42: empty.services, empty.projects and empty.architecture exist in ES and EN, non-empty, at most 160 characters and distinct per language', () => {
    for (const lang of LANGS) {
      for (const key of ['services', 'projects', 'architecture'] as const) {
        const text = dictionaries[lang].empty[key];
        expect(text.trim(), `${lang} ${key}`).not.toBe('');
        expect(text.length, `${lang} ${key}`).toBeLessThanOrEqual(160);
        expect(text, `${lang} ${key}`).not.toMatch(FORBIDDEN);
        expect(text, `${lang} ${key}`).not.toMatch(/\d/);
      }
    }
    for (const key of ['services', 'projects', 'architecture'] as const) expect(dictionaries.en.empty[key]).not.toBe(dictionaries.es.empty[key]);
    const keys = (lang: 'es' | 'en') => flatten(dictionaries[lang]).map(([key]) => key).sort();
    expect(keys('es')).toEqual(keys('en'));
  });

  it('extra: the two dictionaries do not share the same copy (EN is translated, not copied from ES)', () => {
    expect(dictionaries.en.hero.profile.h1).not.toBe(dictionaries.es.hero.profile.h1);
    expect(dictionaries.en.hero.services.h1).not.toBe(dictionaries.es.hero.services.h1);
  });
});

describe('config', () => {
  it('T24: the supported languages are es and en', () => {
    expect(LANGS).toEqual(['es', 'en']);
  });
});

describe('formatPeriod', () => {
  it('T26: a current period reads "2017 — hoy" / "2017 — Present"', () => {
    const period = { start: '2017-10', end: null, current: true };
    expect(formatPeriod(period, 'es')).toBe('2017 — hoy');
    expect(formatPeriod(period, 'en')).toBe('2017 — Present');
  });

  it('T27: a closed period shows both years, or one when they match', () => {
    expect(formatPeriod({ start: '2014-03', end: '2016-11', current: false }, 'es')).toBe('2014 — 2016');
    expect(formatPeriod({ start: '2016-01', end: '2016-11', current: false }, 'es')).toBe('2016');
  });

  it('T28: an unexpected start never throws nor prints NaN or undefined', () => {
    for (const start of ['2017', '', 'abc']) {
      for (const end of [null, undefined, '', 'xx']) {
        const text = formatPeriod({ start, end, current: false }, 'es');
        expect(text).not.toMatch(/NaN|undefined|null/);
      }
    }
    expect(formatPeriod({ start: '2017', current: false }, 'es')).toBe('2017');
    expect(formatPeriod({ start: '', end: null, current: false }, 'es')).toBe('');
  });
});

describe('formatCountry', () => {
  it('BA-T43: ES gives «España» / «Spain» by language; an unknown, malformed or empty code gives null', () => {
    expect(formatCountry('ES', 'es')).toBe('España');
    expect(formatCountry('ES', 'en')).toBe('Spain');
    expect(formatCountry('es', 'en')).toBe('Spain');
    for (const code of ['XX', '', null, undefined, 'ESP', '1', ' ']) expect(formatCountry(code, 'es'), String(code)).toBeNull();
  });
});

describe('initials and earliestYear', () => {
  it('extra: initials take the first and last word, one letter for one word, a dash for nothing', () => {
    expect(initials('Ada Ejemplo')).toBe('AE');
    expect(initials('  ada   maría   ejemplo ')).toBe('AE');
    expect(initials('Ada')).toBe('A');
    expect(initials('')).toBe('—');
  });

  it('extra: earliestYear picks the oldest valid start and ignores unparseable ones', () => {
    const period = (start: string) => ({ start, current: false });
    expect(earliestYear([period('2017-10'), period('2010-01'), period('2014')])).toBe('2010');
    expect(earliestYear([period('abc'), period('')])).toBeNull();
    expect(earliestYear([])).toBeNull();
  });
});
