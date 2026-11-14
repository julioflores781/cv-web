// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readText, stripComments } from '@/tests/helpers/css';

const css = stripComments(readText('components/admin/editor.module.css'));
const narrow = /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
/** Declarations of the first `selector { … }` rule of `source` (plain properties, which the shared helper does not read). */
const props = (body: string): Record<string, string> => Object.fromEntries([...body.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1] as string, (match[2] as string).trim()]));
const rule = (source: string, selector: string) => props(new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(source)?.[1] ?? '');

describe('editor.module.css: the sticky save bar', () => {
  it('regresion extra (V3): on a phone the comment takes its own row instead of a 280 px tall column, and focus scrolls above the bar', () => {
    expect(narrow).not.toBe('');
    expect(rule(narrow, '.saveBar')['flex-direction']).toBeUndefined();
    expect(rule(narrow, '.comment')['flex-basis']).toBe('100%');
    expect(rule(css, '.saveBar')).toMatchObject({ position: 'sticky', bottom: '0' });
    expect(rule(css, ':global(html):has(.saveBar)')['scroll-padding-bottom']).toMatch(/rem$/);
    expect(rule(narrow, ':global(html):has(.saveBar)')['scroll-padding-bottom']).toMatch(/rem$/);
  });

  it('regresion extra (V9): a natively disabled primary button is dimmed like an aria-disabled one', () => {
    const form = stripComments(readText('components/admin/form.module.css'));
    expect(rule(form, '.button:disabled')).toMatchObject({ opacity: '0.7' });
    expect(rule(form, '.button[aria-disabled="true"]')).toMatchObject({ opacity: '0.7' });
  });
});
