import { describe, expect, it } from 'vitest';
import { readText, rules } from '@/tests/helpers/css';

const css = readText('components/service-cards.module.css');
const rule = (selector: string) => rules(css).find((candidate) => candidate.selector === selector)?.body ?? '';

describe('service-cards.module.css', () => {
  it('CO-T21: a marked card has a 2px accent border and an 8px 8px 0 accent shadow; an unmarked one a 2px --line2 border', () => {
    expect(rule('.on')).toMatch(/border:\s*2px solid var\(--accent\)/);
    expect(rule('.on')).toMatch(/box-shadow:\s*8px 8px 0 var\(--accent\)/);
    expect(rule('.off')).toMatch(/border:\s*2px solid var\(--line2\)/);
    expect(rule('.card')).toMatch(/min-height:\s*230px/);
    expect(rule('.card')).toMatch(/padding:\s*24px/);
  });
});
