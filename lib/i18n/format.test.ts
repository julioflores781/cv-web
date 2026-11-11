import { describe, expect, it } from 'vitest';
import { getDictionary } from './dictionaries';
import { formatPrice } from './format';

const plain = (text: string) => text.replace(/[  ]/g, ' ');
const labels = (lang: 'es' | 'en') => ({ from: getDictionary(lang).services.priceFrom, onRequest: getDictionary(lang).services.onRequest });

describe('formatPrice', () => {
  it('CO-T14: {from:1500, EUR} reads «desde 1500 € + impuestos» in Spanish and «from €1,500 + taxes» in English', () => {
    const price = { from: 1500, currency: 'EUR' };
    expect(plain(formatPrice(price, 'es', labels('es')))).toBe('desde 1500 € + impuestos');
    expect(plain(formatPrice(price, 'en', labels('en')))).toBe('from €1,500 + taxes');
  });

  it('CO-T15: null is «a consultar» / «on request» without suffix, and {from:0} is a price', () => {
    expect(formatPrice(null, 'es', labels('es'))).toBe('a consultar');
    expect(formatPrice(null, 'en', labels('en'))).toBe('on request');
    expect(plain(formatPrice({ from: 0, currency: 'EUR' }, 'es', labels('es')))).toBe('desde 0 € + impuestos');
  });

  it('extra: an unknown currency never throws', () => {
    expect(formatPrice({ from: 5, currency: 'ZZ' }, 'es', labels('es'))).toContain('5 ZZ');
  });
});
