import { describe, expect, it } from 'vitest';
import { cssFiles, readText, rules } from '@/tests/helpers/css';

const rule = (file: string, selector: string) => rules(readText(file)).find((candidate) => candidate.selector === selector)?.body ?? '';
const px = (body: string, prop: string) => Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(body)?.[1]);

describe('content module styles', () => {
  it('CO-T73: fields min-height 48, button and CTAs 52, input borders through --line-input, one global reduced-motion block and the 640px breakpoint', () => {
    const form = 'components/contact-form.module.css';
    expect(px(rule(form, '.field'), 'min-height')).toBeGreaterThanOrEqual(48);
    expect(rule(form, '.field')).toMatch(/border:\s*1px solid var\(--line-input\)/);
    expect(rule(form, '.field')).toMatch(/border-radius:\s*0/);
    expect(px(rule(form, '.button'), 'min-height')).toBeGreaterThanOrEqual(52);
    expect(px(rule('components/ui/ui.module.css', '.cta'), 'min-height')).toBeGreaterThanOrEqual(52);

    // --line-input is the plain line in the plano and the darker one in the obra (WCAG 1.4.11).
    const globals = readText('app/globals.css');
    expect(globals).toMatch(/\[data-mode="services"\]\s*{[^}]*--line-input:\s*rgba\(18, 56, 42, 0\.55\)/);

    // Motion lives in a single global block (BA-T16); the modules of this slice declare none of their own.
    const modules = ['contact-form', 'service-cards', 'engagement-aside', 'process', 'project-featured', 'project-card', 'projects', 'selection-line'];
    for (const name of modules) expect(readText(`components/${name}.module.css`), name).not.toMatch(/prefers-reduced-motion/);
    expect(readText('components/service-cards.module.css')).toMatch(/transition:/);
    expect(globals).toMatch(/@media \(prefers-reduced-motion: reduce\)[^{]*{[^}]*transition: none/);
    expect(cssFiles().filter((file) => /prefers-reduced-motion/.test(readText(file)))).toEqual(['app/globals.css']);

    expect(readText('components/ui/ui.module.css')).toMatch(/@media \(max-width: 640px\)/);
  });
});
