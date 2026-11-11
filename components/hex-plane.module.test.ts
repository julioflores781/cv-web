import { describe, expect, it } from 'vitest';
import { readText, rules } from '@/tests/helpers/css';

const css = readText('components/hex-plane.module.css');
const globals = readText('app/globals.css');
const rule = (selector: string) => rules(css).find((candidate) => candidate.selector === selector)?.body ?? '';

describe('hex-plane.module.css', () => {
  it('HX-T38: node and chip sizes, text clamp, aspect ratio, inverted focus, motion, wrapping and scripting', () => {
    const node = rule('.node');
    expect(Number(/min-height:\s*(\d+)px/.exec(node)?.[1])).toBeGreaterThanOrEqual(48);
    expect(node).toMatch(/font-size:\s*clamp\(12px,\s*1\.25vw,\s*15px\)/);
    expect(node).toMatch(/aspect-ratio:\s*0\.866\s*\/\s*1/);
    expect(node).toMatch(/width:\s*20%/);
    expect(node).toMatch(/overflow-wrap:\s*anywhere/);
    expect(Number(/min-height:\s*(\d+)px/.exec(rule('.chip'))?.[1])).toBeGreaterThanOrEqual(44);
    expect(rule('.core')).toMatch(/width:\s*30%/);
    expect(rule('.box')).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    expect(rule('.box')).toMatch(/max-width:\s*540px/);

    // A clip-path would cut an outline: the focus inverts the colours instead.
    const focus = rule('.node:focus-visible');
    expect(focus).toMatch(/background:\s*var\(--ink\)/);
    expect(focus).toMatch(/color:\s*var\(--bg\)/);
    expect(focus).toMatch(/outline:\s*none/);

    // Motion: the module animates flow and transitions the hover; the single global reduced-motion block stops both.
    expect(rule('.flow')).toMatch(/animation:\s*flow\b/);
    expect(node).toMatch(/transition:\s*transform/);
    expect(rule('.node:hover')).toMatch(/scale\(1\.07\)/);
    expect(css).not.toMatch(/prefers-reduced-motion/);
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{\s*([^{]+){([^}]*)}/.exec(globals);
    expect(block?.[1]).toMatch(/\*/);
    expect(block?.[2]).toMatch(/animation:\s*none/);
    expect(block?.[2]).toMatch(/transition:\s*none/);

    // HX-A10: no horizontal overflow at 390px with the list layout (>6 ports) nor with long adapter names in the noscript.
    const plane = rules(css).filter((candidate) => candidate.selector === '.plane').map((candidate) => candidate.body).join(';');
    expect(plane).toMatch(/width:\s*100%/);
    expect(plane).toMatch(/max-width:\s*100%/);
    expect(plane).toMatch(/min-width:\s*0/);
    expect(rule('.groupList')).toMatch(/grid-template-columns:/);
    expect(rule('.noscript')).toMatch(/overflow-wrap:\s*anywhere/);

    expect(css).toMatch(/@media\s*\(scripting:\s*none\)\s*{\s*\.choices\s*{[^}]*display:\s*none/);
  });
});
