import { describe, expect, it } from 'vitest';
import { effectiveMessageMax, validateContact } from './validate';

const ok = { name: 'Ada', email: 'ada@example.test', message: 'Un mensaje de ejemplo' };
const check = (patch: Partial<typeof ok>, prefix = '') => validateContact({ ...ok, ...patch }, prefix);

describe('validateContact', () => {
  it('CO-T41: name empty, only spaces, 100 and 101 characters after trimming -> required, required, valid, too-long', () => {
    expect(check({ name: '' }).name).toBe('required');
    expect(check({ name: '   ' }).name).toBe('required');
    expect(check({ name: ` ${'n'.repeat(100)} ` }).name).toBeUndefined();
    expect(check({ name: 'n'.repeat(101) }).name).toBe('too-long');
  });

  it('CO-T42: valid and malformed emails, and the 254 / 255 limit', () => {
    expect(check({ email: 'ada@example.test' }).email).toBeUndefined();
    for (const bad of ['ada', 'ada@', '@x.y', 'a b@x.y', 'ada@x', 'a@@x.y']) expect(check({ email: bad }).email, bad).toBe('invalid-format');
    const sized = (length: number) => `${'a'.repeat(length - 'x@e.test'.length)}x@e.test`;
    expect(check({ email: sized(254) }).email).toBeUndefined();
    expect(check({ email: sized(255) }).email).toBe('too-long');
  });

  it('CO-T43: messages of 9, 10, 2000 and 2001 characters and only spaces', () => {
    expect(check({ message: 'm'.repeat(9) }).message).toBe('too-short');
    expect(check({ message: 'm'.repeat(10) }).message).toBeUndefined();
    expect(check({ message: 'm'.repeat(2000) }).message).toBeUndefined();
    expect(check({ message: 'm'.repeat(2001) }).message).toBe('too-long');
    expect(check({ message: ' '.repeat(40) }).message).toBe('too-short');
  });

  it('CO-T44: emojis count as 2 UTF-16 units like the server and padding spaces are trimmed first', () => {
    expect(check({ message: '😀'.repeat(5) }).message).toBeUndefined();
    expect(check({ message: '😀'.repeat(4) }).message).toBe('too-short');
    expect(check({ message: '😀'.repeat(1000) }).message).toBeUndefined();
    expect(check({ message: '😀'.repeat(1001) }).message).toBe('too-long');
    expect(check({ message: `   ${'m'.repeat(2000)}   ` }).message).toBeUndefined();
  });

  it('CO-T45: three invalid fields are reported at once', () => {
    expect(validateContact({ name: '', email: 'x', message: 'corto' })).toEqual({ name: 'required', email: 'invalid-format', message: 'too-short' });
  });

  it('CO-T38 / CO-T39 (rules): the prefix does not count for the minimum but does for the maximum', () => {
    const prefix = `${'p'.repeat(98)}\n\n`;
    expect(prefix.length).toBe(100);
    expect(effectiveMessageMax(prefix)).toBe(1900);
    expect(check({ message: 'm'.repeat(9) }, prefix).message).toBe('too-short');
    expect(check({ message: 'm'.repeat(1900) }, prefix).message).toBeUndefined();
    expect(check({ message: 'm'.repeat(1950) }, prefix).message).toBe('too-long');
  });
});
