import { describe, expect, it } from 'vitest';
import { servicesModel } from './services';
import { COMMENT_FIELD_ID, dropFields, isBelow, mapViolations, parsePath, type ErrorMap } from './paths';

describe('violation paths', () => {
  it('T308: valid paths parse with or without a language; malformed ones are null without throwing or polluting prototypes', () => {
    expect(parsePath('es.projects[1].images[0].key')).toEqual({ lang: 'es', segments: ['projects', 1, 'images', 0, 'key'] });
    expect(parsePath('projects[1].relation')).toEqual({ lang: null, segments: ['projects', 1, 'relation'] });
    expect(parsePath('en.core')).toEqual({ lang: 'en', segments: ['core'] });
    expect(parsePath('es')).toEqual({ lang: 'es', segments: [] });
    for (const bad of ['es.', '..', 'es.projects[x]', '__proto__', 'es.__proto__.x', 'constructor.prototype', '', 'a'.repeat(201), 'es.services[-1]', 'es services']) {
      expect(parsePath(bad), bad).toBeNull();
    }
    expect(parsePath(42)).toBeNull();
    const draft = servicesModel.pair({ services: [{ id: 'a', title: 'A', summary: 'S' }] }, { services: [{ id: 'a', title: 'A', summary: 'S' }] });
    mapViolations(servicesModel, draft, [{ path: '__proto__.polluted', code: 'REQUIRED' }, { path: 'constructor.prototype.polluted', code: 'REQUIRED' }]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('T309: server errors land on {item, field, language|common}; ES/EN copies of a common field merge; the unknown goes to the summary in a stable order', () => {
    const draft = servicesModel.pair(
      { services: [{ id: 'a', title: 'A', summary: 'S' }, { id: 'b', title: 'B', summary: 'S' }] },
      { services: [{ id: 'a', title: 'A', summary: 'S' }, { id: 'b', title: 'B', summary: 'S' }, { id: 'c', title: 'C', summary: 'S' }] },
    );
    const [a, b, c] = draft.items.map((pair) => pair.key) as [string, string, string];
    const map = mapViolations(servicesModel, draft, [
      { path: 'zzz.unknown', code: 'UNKNOWN_FIELD' },
      { path: 'en.services[1].id', code: 'INVALID_ID' },
      { path: 'es.services[1].id', code: 'INVALID_ID' },
      { path: 'es.services[0].title', code: 'REQUIRED' },
      { path: 'en.services[2].summary', code: 'TOO_LONG' },
      { path: 'services[1].price', code: 'PARITY_MISMATCH' },
      { path: 'es.services[0].colour', code: 'UNKNOWN_FIELD' },
      { path: 'comment', code: 'TOO_LONG' },
      { path: 'es.services', code: 'TOO_MANY' },
    ]);
    expect(map.fields).toEqual({
      [`campo-${a}-es-title`]: 'REQUIRED',
      [`campo-${b}-common-id`]: 'INVALID_ID',
      [`campo-${b}-common-price`]: 'PARITY_MISMATCH',
      [`campo-${c}-en-summary`]: 'TOO_LONG',
      [COMMENT_FIELD_ID]: 'TOO_LONG',
    });
    expect(map.entries.filter((entry) => entry.fieldId === null).map((entry) => entry.path)).toEqual(['es.services', 'es.services[0].colour', 'zzz.unknown']);
    expect(map.entries.filter((entry) => entry.code === 'INVALID_ID')).toHaveLength(1);
    expect(map.items).toEqual({ [a]: 2, [b]: 2, [c]: 1 });
    // Same input, same order.
    expect(mapViolations(servicesModel, draft, [...map.entries].reverse()).entries.map((entry) => entry.path)).toEqual(map.entries.map((entry) => entry.path));
  });

  it('regresion extra: dropFields takes the picked fields and their summary entries off and recounts the items; isBelow picks only the rows of a list', () => {
    const below = isBelow(['campo-k1-es-links']);
    expect(below('campo-k1-es-links-0-url')).toBe(true);
    expect(below('campo-k1-es-links')).toBe(false);
    expect(below('campo-k1-es-linksx-0')).toBe(false);
    expect(below('campo-k1-en-links-0-url')).toBe(false);

    const errors: ErrorMap = {
      fields: { 'campo-k1-es-links-1-url': 'INVALID_URL', 'campo-k1-es-role': 'TOO_LONG' },
      entries: [
        { path: 'es.projects[0].links[1].url', code: 'INVALID_URL', location: { itemKey: 'k1', scope: 'es', field: 'links.1.url' }, fieldId: 'campo-k1-es-links-1-url' },
        { path: 'es.projects[0].role', code: 'TOO_LONG', location: { itemKey: 'k1', scope: 'es', field: 'role' }, fieldId: 'campo-k1-es-role' },
        { path: 'es.projects[0]', code: 'DUPLICATE_ID', location: { itemKey: 'k1', scope: 'common', field: '' }, fieldId: null },
      ],
      items: { k1: 3 },
    };
    const left = dropFields(errors, below);
    expect(left.fields).toEqual({ 'campo-k1-es-role': 'TOO_LONG' });
    expect(left.entries.map((entry) => entry.path)).toEqual(['es.projects[0].role', 'es.projects[0]']);
    expect(left.items).toEqual({ k1: 2 });
    expect(dropFields(left, () => true)).toEqual({ fields: {}, entries: [left.entries[1]], items: { k1: 1 } });
  });
});
