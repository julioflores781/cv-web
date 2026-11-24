import { describe, expect, it } from 'vitest';
import { readText, rules, stripComments, withoutTokenBlocks } from '@/tests/helpers/css';

const FILES = ['components/trajectory.module.css', 'components/education-section.module.css'];

/** Every `property: value` of a rule body (`declarations` of the helper only keeps custom properties). */
function properties(body: string): Array<[string, string]> {
  return body
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes(':'))
    .map((part): [string, string] => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim()]);
}

/** What may remain of a colour-bearing value once tokens and plain lengths/keywords are removed: nothing. */
function colourLeftover(value: string): string {
  return value
    .replace(/var\(--[\w-]+\)/g, '')
    .replace(/\bcurrentColor\b|\btransparent\b/g, '')
    .replace(/\b(?:solid|dashed|dotted|none|inherit)\b/g, '')
    .replace(/-?\d*\.?\d+(?:px|em|rem|%)?/g, '')
    .trim();
}

/** The body of every `@media (max-width: Npx) { … }` block, with its N. */
function maxWidthBlocks(css: string): Array<{ width: number; body: string }> {
  return [...stripComments(css).matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)].map((match) => ({
    width: Number(match[1]),
    body: match[2] as string,
  }));
}

describe('trajectory.module.css and education-section.module.css', () => {
  it('TR-T18: colours, backgrounds and borders only use tokens, currentColor or transparent; no font-family but var(--font-…); no transition, animation, @keyframes nor reduced-motion block of their own', () => {
    for (const file of FILES) {
      const css = readText(file);
      const all = rules(css);
      expect(all.length, file).toBeGreaterThan(5);
      for (const rule of all) {
        for (const [property, value] of properties(rule.body)) {
          if (/^(?:color|background(?:-[\w-]+)?|border(?:-[\w-]+)?|outline(?:-color)?)$/.test(property)) {
            expect(colourLeftover(value), `${file} ${rule.selector} ${property}: ${value}`).toBe('');
          }
          if (property === 'font-family') expect(value, `${file} ${rule.selector}`).toMatch(/^var\(--font-[\w-]+\)$/);
          expect(property, `${file} ${rule.selector}`).not.toMatch(/^(?:transition|animation)(?:-[\w-]+)?$/);
        }
      }
      expect(css, file).not.toMatch(/@keyframes|prefers-reduced-motion/);
      // The BA-T10 rule, applied to these two files: no literal colour anywhere outside the token blocks.
      expect(withoutTokenBlocks(css), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/);
    }
  });

  it('TR-T19: education stacks its columns at 640px or less (grid-template-columns: 1fr); the achievements summary has min-height of at least 44px and cursor: pointer', () => {
    const education = readText('components/education-section.module.css');
    const stacked = maxWidthBlocks(education).filter((block) => block.width <= 640 && /grid-template-columns:\s*1fr\s*;/.test(block.body));
    expect(stacked.length).toBeGreaterThan(0);
    expect(stacked[0]?.body).toMatch(/\.columns\s*\{/);
    expect(rules(education).find((rule) => rule.selector === '.columns')?.body).toMatch(/grid-template-columns:\s*repeat\(auto-fit/);

    const toggle = rules(readText('components/trajectory.module.css')).find((rule) => rule.selector === '.toggle');
    expect(toggle, '.toggle').toBeDefined();
    const height = /min-height:\s*(\d+)px/.exec(toggle?.body ?? '');
    expect(Number(height?.[1])).toBeGreaterThanOrEqual(44);
    expect(toggle?.body).toMatch(/cursor:\s*pointer/);
    // The class really sits on the <summary> of the disclosure.
    expect(readText('components/trajectory.tsx')).toMatch(/<summary className=\{`\$\{styles\.toggle\}/);
  });
});
