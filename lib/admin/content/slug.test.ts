import { describe, expect, it } from 'vitest';
import { slugify, suggestId } from './slug';

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('slug', () => {
  it('T301: «Reserva de turnos», «Ñandú & Co.», empty and over 64 characters; always a valid id', () => {
    expect(slugify('Reserva de turnos')).toBe('reserva-de-turnos');
    expect(slugify('Ñandú & Co.')).toBe('nandu-co');
    expect(slugify('')).toBe('');
    expect(slugify('  ¿¡!?  ')).toBe('');
    const long = slugify(`${'palabra '.repeat(12)}final`);
    expect(long.length).toBeLessThanOrEqual(64);
    for (const value of ['Reserva de turnos', 'Ñandú & Co.', `${'palabra '.repeat(12)}final`, 'a--b__c', '-x-', 'ÀÉÎõü 2024']) expect(slugify(value)).toMatch(ID);
    expect(suggestId('x'.repeat(70), ['x'.repeat(64)])).toMatch(/^x{62}-2$/);
  });
});
