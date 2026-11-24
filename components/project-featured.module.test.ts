import { describe, expect, it } from 'vitest';
import { readText, rules } from '@/tests/helpers/css';

describe('project-featured sources', () => {
  it('FF-T2: neither project-featured.module.css nor project-featured.tsx names factKey (the h-NN label is gone with its rule)', () => {
    const css = readText('components/project-featured.module.css');
    const tsx = readText('components/project-featured.tsx');
    // The files read are the real ones: the facts grid and its text class are still there.
    expect(rules(css).map((rule) => rule.selector)).toEqual(expect.arrayContaining(['.facts', '.fact', '.factText']));
    expect(tsx).toContain('styles.factText');
    expect(css).not.toContain('factKey');
    expect(tsx).not.toContain('factKey');
  });
});
