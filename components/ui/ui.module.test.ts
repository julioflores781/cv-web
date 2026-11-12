import { describe, expect, it } from 'vitest';
import { readText, rules, withoutTokenBlocks } from '@/tests/helpers/css';

const css = readText('components/ui/ui.module.css');

describe('ui.module.css empty state', () => {
  it('T48: .empty paints only with token variables (no hex, rgb or hsl colours) and keeps a muted AA text colour', () => {
    const body = rules(css).find((rule) => rule.selector === '.empty')?.body ?? '';
    expect(body).toMatch(/border:\s*1px dashed var\(--line\)/);
    expect(body).toMatch(/color:\s*var\(--muted\)/);
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(withoutTokenBlocks(css)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
