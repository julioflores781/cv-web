// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contrast, cssFiles, readText, rules, tokensOf, withoutTokenBlocks } from '@/tests/helpers/css';

const globals = readText('app/globals.css');
const plano = tokensOf(globals, ':root');
const obra = tokensOf(globals, '[data-mode="services"]');
const allCss = cssFiles();
const modules = allCss.filter((file) => file.endsWith('.module.css'));

// Tokens of the artifact v2 (`.plano` / `.obra`), analysis §0.
const PLANO = {
  '--bg': '#0F2A1F', '--bg2': '#0B2118', '--surface': '#17382A', '--node': '#1F4D39', '--ink': '#F1F6EE',
  '--muted': '#B5CABB', '--line': 'rgba(255, 255, 255, 0.3)', '--line2': 'rgba(255, 255, 255, 0.14)', '--field': '#0B2118',
};
const OBRA = {
  '--bg': '#F4F3EC', '--bg2': '#E9E8DE', '--surface': '#FFFFFF', '--node': '#FFFFFF', '--ink': '#12382A',
  '--muted': '#486255', '--line': 'rgba(18, 56, 42, 0.32)', '--line2': 'rgba(18, 56, 42, 0.12)', '--field': '#FFFFFF',
};

/** `rgba(255, 255, 255, 0.3)` and `rgba(255,255,255,.3)` are the same token. */
const normalise = (value: string | undefined) =>
  (value ?? '').replace(/\s+/g, '').replace(/(\D)0\./g, '$1.').toLowerCase();

describe('design tokens', () => {
  it('BA-T8: the 9 plano tokens (:root) and the 9 obra tokens ([data-mode="services"]) are the design values, plus the accents', () => {
    for (const [name, value] of Object.entries(PLANO)) expect(normalise(plano[name]), `plano ${name}`).toBe(normalise(value));
    for (const [name, value] of Object.entries(OBRA)) expect(normalise(obra[name]), `obra ${name}`).toBe(normalise(value));
    expect(plano['--accent-ink']).toBe('#0A2016');
    expect(plano['--accent-plano']).toBe('#C6F24E');
    expect(plano['--accent-obra']).toBe('#2FC98A');
    expect(plano['--accent']).toBe('var(--accent-plano)');
  });

  it('BA-T9: obra redefines --accent as var(--accent-obra) and --line-input as rgba(18,56,42,.55), without hex', () => {
    expect(obra['--accent']).toBe('var(--accent-obra)');
    expect(normalise(obra['--line-input'])).toBe(normalise('rgba(18,56,42,.55)'));
    expect(obra['--accent']).not.toMatch(/#/);
    expect(obra['--line-input']).not.toMatch(/#/);
  });

  it('BA-T10: no hex nor rgb( exists outside the token blocks, in any css file', () => {
    const offenders = allCss.filter((file) => {
      const text = withoutTokenBlocks(readText(file));
      return /#[0-9a-fA-F]{3,8}\b/.test(text) || /\b(rgb|hsl)a?\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('BA-T11: every text pair of the design is at least 4.5:1, computed from the tokens', () => {
    const plain = (mode: Record<string, string>, accent: string): Array<[string, string, string]> => {
      const get = (name: string) => mode[name] as string;
      return [
        ['ink/bg', get('--ink'), get('--bg')],
        ['ink/surface', get('--ink'), get('--surface')],
        ['ink/node', get('--ink'), get('--node')],
        ['muted/bg', get('--muted'), get('--bg')],
        ['muted/bg2', get('--muted'), get('--bg2')],
        ['muted/surface', get('--muted'), get('--surface')],
        ['muted/node', get('--muted'), get('--node')],
        ['accent-ink/accent', plano['--accent-ink'] as string, accent],
      ];
    };
    const pairs = [
      ...plain(PLANO, plano['--accent-plano'] as string).map((pair) => ['plano', ...pair] as const),
      ...plain(OBRA, plano['--accent-obra'] as string).map((pair) => ['obra', ...pair] as const),
    ];
    for (const [mode, name, fg, bg] of pairs) expect(contrast(fg, bg), `${mode} ${name}`).toBeGreaterThanOrEqual(4.5);
  });

  it('BA-T14: --font-head|text|mono start with the next/font variables and keep their fallbacks', () => {
    expect(plano['--font-head']).toMatch(/^var\(--face-head\),.*'Arial Narrow'/);
    expect(plano['--font-text']).toMatch(/^var\(--face-text\),.*system-ui/);
    expect(plano['--font-mono']).toMatch(/^var\(--face-mono\),.*ui-monospace/);
  });

  it('BA-T15: .gridbg is an 84px x 48.5px mesh and obra swaps the SVG', () => {
    const base = rules(globals).find((rule) => rule.selector === '.gridbg');
    expect(base?.body).toMatch(/background-size:\s*84px 48\.5px/);
    expect(base?.body).toContain('/hex-grid-plano.svg');
    const swapped = rules(globals).find((rule) => rule.selector === '[data-mode="services"] .gridbg');
    expect(swapped?.body).toContain('/hex-grid-obra.svg');
  });

  it('BA-T19: app/icon.svg is a hexagon with only token colours and no script', () => {
    const svg = readText('app/icon.svg');
    expect(svg).toContain('<polygon');
    expect(svg).not.toMatch(/<script/i);
    const colours = [...svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0].toUpperCase());
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) expect(['#C6F24E', '#0A2016']).toContain(colour);
  });
});

describe('css behaviour', () => {
  it('BA-T16: one reduced-motion block stops every transition and animation of every module, and :focus-visible has an outline', () => {
    const reduced = globals.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g) ?? [];
    expect(reduced).toHaveLength(1);
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{\s*([^{]+){([^}]*)}/.exec(globals);
    expect(block?.[1]).toMatch(/\*/);
    expect(block?.[2]).toMatch(/animation:\s*none/);
    expect(block?.[2]).toMatch(/transition:\s*none/);
    // The modules only rely on that block: none of them opts out with its own reduced-motion rule.
    for (const file of modules) expect(readText(file), file).not.toMatch(/prefers-reduced-motion/);
    expect(globals).toMatch(/:focus-visible\s*{[^}]*outline:\s*[^;]+/);
  });

  const LAYOUT = [
    'components/hero.module.css',
    'components/impact-band.module.css',
    'components/ui/ui.module.css',
  ];

  it('BA-T17: layout modules collapse to one column at 640px or less and no fixed width over 320px lacks max-width:100%', () => {
    for (const file of LAYOUT) {
      const css = readText(file);
      const media = /@media\s*\(max-width:\s*(\d+)px\)/.exec(css);
      expect(media, file).not.toBeNull();
      expect(Number(media?.[1]), file).toBeLessThanOrEqual(640);
    }
    expect(readText('components/hero.module.css')).toMatch(/@media[^{]*{[^@]*flex-direction:\s*column/);
    // The cajetin grid (auto-fit, minmax(min(200px, 100%), 1fr)) is a single column at 390px by itself: parity forbids overriding it.
    expect(readText('components/impact-band.module.css')).toMatch(/@media[^{]*{[^@]*grid-template-columns:\s*1fr\s*;/);
    expect(readText('components/ui/ui.module.css')).toMatch(/@media[^{]*{[^@]*flex-direction:\s*column/);
    for (const file of modules) {
      for (const rule of rules(readText(file))) {
        const fixed = /(?:^|[;\s])width:\s*(\d+)px/.exec(rule.body);
        if (fixed && Number(fixed[1]) > 320) expect(rule.body, `${file} ${rule.selector}`).toMatch(/max-width:\s*100%/);
      }
    }
  });

  it('BA-T18: toggle, language switch and header links declare min-width/min-height of at least 44px', () => {
    const targets: Array<[string, string, boolean]> = [
      ['components/mode-toggle.module.css', '.segment', true],
      ['components/language-switch.module.css', '.item', true],
      ['components/site-header.module.css', '.link', false],
    ];
    for (const [file, selector, needsWidth] of targets) {
      const rule = rules(readText(file)).find((candidate) => candidate.selector === selector);
      expect(rule, `${file} ${selector}`).toBeDefined();
      const height = /min-height:\s*(\d+)px/.exec(rule?.body ?? '');
      expect(Number(height?.[1]), `${file} min-height`).toBeGreaterThanOrEqual(44);
      if (needsWidth) {
        const width = /min-width:\s*(\d+)px/.exec(rule?.body ?? '');
        expect(Number(width?.[1]), `${file} min-width`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
