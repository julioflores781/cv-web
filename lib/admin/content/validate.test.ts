import { describe, expect, it } from 'vitest';
import { key, LIMIT_CASES, VECTORS } from '@/tests/helpers/admin-content';
import { compareParity, comparePaths, validateDocument, validateSave } from './validate';

const run = (kind: 'services' | 'projects' | 'architecture') => {
  const cases = [...VECTORS.validation, ...LIMIT_CASES].filter((vector) => vector.kind === kind);
  for (const vector of cases) expect(key(validateDocument(vector.kind, 'es', vector.document)), vector.name).toEqual(key(vector.expected));
  return new Set(cases.flatMap((vector) => vector.expected.map((v) => v.code)));
};

describe('client validator (mirror of ContentValidator / ContentParity)', () => {
  it('T299: parity differences of ids, order and neutral fields are the ones of ContentParity, with unprefixed paths', () => {
    for (const vector of VECTORS.parity) expect(key(compareParity(vector.kind, vector.es, vector.en)), vector.name).toEqual(key(vector.expected));
    expect(compareParity('services', { services: [{ id: 'a', price: null }, { id: 'b' }] }, { services: [{ id: 'b' }, { id: 'a' }] })).toEqual([
      { path: 'services[0].id', code: 'PARITY_MISMATCH' },
      { path: 'services[1].id', code: 'PARITY_MISMATCH' },
    ]);
  });

  it('T302: services vectors give exactly the contract codes and paths (REQUIRED, TOO_LONG 120/600, price, DUPLICATE_ID, INVALID_ID, TOO_MANY 30, UNKNOWN_FIELD)', () => {
    const codes = run('services');
    for (const code of ['REQUIRED', 'TOO_LONG', 'INVALID_VALUE', 'DUPLICATE_ID', 'INVALID_ID', 'TOO_MANY', 'UNKNOWN_FIELD']) expect(codes, code).toContain(code);
  });

  it('T303: projects vectors cover enums, client rules, dates, stack, highlights, links, images and TOO_MANY 50', () => {
    const codes = run('projects');
    for (const code of ['INVALID_VALUE', 'REQUIRED', 'ANONYMOUS_CLIENT_FORBIDDEN', 'CLIENT_REQUIRED', 'INVALID_DATE', 'TOO_LONG', 'TOO_MANY', 'INVALID_URL', 'IMAGES_NOT_ALLOWED_FOR_PROJECT', 'IMAGE_KEY_INVALID', 'UNKNOWN_FIELD']) {
      expect(codes, code).toContain(code);
    }
  });

  it('T304: architecture vectors cover the required core, 80/300/200, 20 ports, 20 adapters, status and duplicate ids per scope', () => {
    const codes = run('architecture');
    for (const code of ['REQUIRED', 'TOO_LONG', 'TOO_MANY', 'INVALID_VALUE', 'DUPLICATE_ID', 'UNKNOWN_FIELD']) expect(codes, code).toContain(code);
  });

  it('T305: lengths count code points, blank text is REQUIRED, exact limits pass and the document is never changed', () => {
    const emoji = '😀'.repeat(120);
    const document = Object.freeze({
      services: Object.freeze([
        Object.freeze({ id: 'a', title: emoji, summary: 'ok' }),
        Object.freeze({ id: 'b', title: `${emoji}😀`, summary: '   ' }),
        Object.freeze({ id: 'c', title: ' \t ', summary: 's'.repeat(600) }),
      ]),
    });
    const snapshot = JSON.stringify(document);
    expect(validateDocument('services', 'es', document)).toEqual([
      { path: 'es.services[1].title', code: 'TOO_LONG' },
      { path: 'es.services[1].summary', code: 'REQUIRED' },
      { path: 'es.services[2].title', code: 'REQUIRED' },
    ]);
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('T306: every error is returned, sorted by path (indexes as numbers), and a comment over 200 is TOO_LONG on comment', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, title: '', summary: 'x' }));
    const result = validateSave('services', { comment: 'c'.repeat(201), documents: { es: { services: many }, en: { services: [{ id: 'BAD', title: 't', summary: 's' }] } } });
    expect(result[0]).toEqual({ path: 'comment', code: 'TOO_LONG' });
    expect(result.map((v) => v.path)).toEqual(['comment', 'en.services[0].id', ...many.map((_, i) => `es.services[${i}].title`)]);
    expect(validateSave('services', { comment: 'c'.repeat(200), documents: { es: { services: [] }, en: { services: [] } } })).toEqual([]);
    expect(comparePaths('es.services[10].id', 'es.services[2].title')).toBeGreaterThan(0);
    // Valid documents that differ: parity is checked too.
    expect(validateSave('services', { comment: '', documents: { es: { services: [{ id: 'a', title: 't', summary: 's' }] }, en: { services: [] } } })).toEqual([
      { path: 'services[0]', code: 'PARITY_MISMATCH' },
    ]);
  });
});
