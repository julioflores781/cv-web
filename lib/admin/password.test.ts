import { describe, expect, it } from 'vitest';
import { validatePasswordChange } from './password';

const ok = 'una frase nueva y larga';
const check = (current: string, next: string, confirm: string) => validatePasswordChange({ current, next, confirm });

describe('validatePasswordChange', () => {
  it('T270: applies the policy 12-128 code points, different from the current one, confirmed', () => {
    expect(check('actual', ok, ok)).toEqual({});
    expect(check('', ok, ok)).toEqual({ current: 'required' });
    expect(check('actual', '', '')).toEqual({ next: 'required' });
    expect(check('actual', 'a'.repeat(11), 'a'.repeat(11))).toEqual({ next: 'too-short' });
    expect(check('actual', 'a'.repeat(12), 'a'.repeat(12))).toEqual({});
    expect(check('actual', 'a'.repeat(128), 'a'.repeat(128))).toEqual({});
    expect(check('actual', 'a'.repeat(129), 'a'.repeat(129))).toEqual({ next: 'too-long' });
    expect(check(ok, ok, ok)).toEqual({ next: 'same-as-current' });
    expect(check('actual', ok, `${ok}!`)).toEqual({ confirm: 'mismatch' });
    // 11 emoji are 22 UTF-16 units but 11 code points; 12 are enough.
    expect(check('actual', '😀'.repeat(11), '😀'.repeat(11))).toEqual({ next: 'too-short' });
    expect(check('actual', '😀'.repeat(12), '😀'.repeat(12))).toEqual({});
    expect(check('actual', '😀'.repeat(129), '😀'.repeat(129))).toEqual({ next: 'too-long' });
  });
});
