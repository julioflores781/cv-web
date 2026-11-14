import { describe, expect, it } from 'vitest';
import { fitsSave, jsonBytes, MAX_SAVE_BYTES } from './size';

/** A save body padded with `ñ` (two bytes in UTF-8) and ASCII up to an exact size. */
function bodyOf(size: number) {
  const base = { baseVersions: { es: 3, en: 3 }, documents: { es: { services: [{ id: 'a', title: 't', summary: '' }] }, en: { services: [] } } };
  const overhead = jsonBytes(base);
  const room = size - overhead;
  const wide = Math.floor(room / 2) - 1;
  const summary = 'ñ'.repeat(wide) + 'a'.repeat(room - wide * 2);
  return { ...base, documents: { ...base.documents, es: { services: [{ id: 'a', title: 't', summary }] } } };
}

describe('save size', () => {
  it('T307: a save of exactly 98 304 UTF-8 bytes passes and one of 98 305 does not', () => {
    const exact = bodyOf(MAX_SAVE_BYTES);
    const over = bodyOf(MAX_SAVE_BYTES + 1);
    expect(jsonBytes(exact)).toBe(98_304);
    expect(jsonBytes(over)).toBe(98_305);
    expect(JSON.stringify(exact).length).toBeLessThan(98_304);
    expect(fitsSave(exact)).toBe(true);
    expect(fitsSave(over)).toBe(false);
  });
});
