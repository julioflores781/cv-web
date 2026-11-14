// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compareParity as fakeParity, validateDocument as fakeValidate } from '@/scripts/parity/admin-fake.mjs';
import { compareParity, validateDocument } from '@/lib/admin/content/validate';
import { key, LIMIT_CASES, VECTORS } from '@/tests/helpers/admin-content';

describe('validator drift (client mirror vs fake API)', () => {
  it('T239: on the same vectors (and the generated limit cases) both validators give the same (path, code) set, for both language roots', () => {
    for (const vector of [...VECTORS.validation, ...LIMIT_CASES]) {
      for (const root of ['es', 'en']) {
        expect(key(validateDocument(vector.kind, root, vector.document)), `${vector.name} (${root})`).toEqual(key(fakeValidate(vector.kind, root, vector.document)));
      }
    }
    for (const vector of VECTORS.parity) expect(key(compareParity(vector.kind, vector.es, vector.en)), vector.name).toEqual(key(fakeParity(vector.kind, vector.es, vector.en)));
  });
});
