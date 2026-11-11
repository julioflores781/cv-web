import { describe, expect, it } from 'vitest';
import { parseProblem } from './problem';

const FULL = { title: 'Not found', detail: 'No such thing', status: 404, code: 'NOT_FOUND' };

describe('parseProblem', () => {
  it('HX-T6: only an object with title, detail, status and code is a problem', () => {
    expect(parseProblem({ type: 'about:blank', ...FULL })).toEqual(FULL);
    for (const missing of ['title', 'detail', 'status', 'code'] as const) {
      const partial: Record<string, unknown> = { ...FULL };
      delete partial[missing];
      expect(parseProblem(partial), missing).toBeNull();
    }
    expect(parseProblem({ ...FULL, status: '404' })).toBeNull();
    for (const junk of [null, undefined, 'x', 42, []]) expect(parseProblem(junk)).toBeNull();
  });
});
