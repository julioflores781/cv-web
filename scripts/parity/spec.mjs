// @ts-check
// Single table of expected metrics (analysis §2.10.1) shared by the CSS tests and the browser probe.
//
// Reading a prop: `at` is the value (px number or string) or `{1440, 390}` per viewport width; `refAt` overrides
// the expectation for the *reference* render where the web deliberately deviates (D1: node text >= 12 px).
// `{token}` inside a string resolves to the computed colour of that token in the page mode (see `resolveExpected`).
// Prop `rect.width` / `rect.height` read `getBoundingClientRect()`; the rest read `getComputedStyle()`.
// `web` selectors use `[data-probe="<key>"]`: the built components expose that attribute on the measured element.

/**
 * @typedef {number | string | Record<number, number>} SpecValue
 * @typedef {{prop: string, at: SpecValue, refAt?: Record<number, number>, deviation?: string}} SpecProp
 * @typedef {{key: string, mode: 'perfil' | 'servicios' | 'both', ref: string, web: string, props: SpecProp[]}} SpecEntry
 * @typedef {'perfil' | 'servicios'} PageMode
 */

export const VIEWPORTS = [1440, 390];

/** Raw tokens from the design (`.plano` / `.obra`), plus the mode accent. Same names as `app/globals.css`. */
/** @type {Record<PageMode, Record<string, string>>} */
export const TOKENS = {
  perfil: {
    bg: '#0F2A1F', bg2: '#0B2118', surface: '#17382A', node: '#1F4D39', ink: '#F1F6EE', muted: '#B5CABB',
    line: 'rgba(255,255,255,.3)', line2: 'rgba(255,255,255,.14)', field: '#0B2118', accent: '#C6F24E', 'accent-ink': '#0A2016',
  },
  servicios: {
    bg: '#F4F3EC', bg2: '#E9E8DE', surface: '#FFFFFF', node: '#FFFFFF', ink: '#12382A', muted: '#486255',
    line: 'rgba(18,56,42,.32)', line2: 'rgba(18,56,42,.12)', field: '#FFFFFF', accent: '#2FC98A', 'accent-ink': '#0A2016',
  },
};

/** Tolerances (§2.10.2). `box` and `font` are in px; `sectionHeightPct` and `bandPixelPct` are percentages. */
export const TOLERANCES = { exact: 0, font: 0.5, box: 2, sectionHeightPct: 2, bandPixelPct: 3 };

const EXACT_PROPS = new Set([
  'backgroundColor', 'color', 'fontFamily', 'fontWeight', 'textTransform', 'position', 'zIndex', 'boxShadow', 'backgroundSize',
]);

/**
 * Tolerance in px (or 0 for exact) for a prop name.
 * @param {string} prop
 * @returns {number}
 */
export function toleranceFor(prop) {
  if (EXACT_PROPS.has(prop)) return TOLERANCES.exact;
  if (prop === 'fontSize' || prop === 'lineHeight' || prop === 'letterSpacing') return TOLERANCES.font;
  return TOLERANCES.box;
}

/**
 * `#RRGGBB` / `rgba(r,g,b,a)` token value -> the string `getComputedStyle` returns.
 * @param {string} raw
 * @returns {string}
 */
export function computedColor(raw) {
  const hex = /^#([0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const [, digits = ''] = hex;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(raw);
  if (rgba) return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${Number(rgba[4])})`;
  throw new Error(`Unsupported colour: ${raw}`);
}

/**
 * Replaces `{token}` placeholders with computed colours for the given mode.
 * @param {SpecValue} value
 * @param {PageMode} mode
 * @returns {SpecValue}
 */
export function resolveExpected(value, mode) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{([a-z0-9-]+)\}/g, (_, name) => computedColor(TOKENS[mode][name] ?? ''));
}

/**
 * Expected value of a prop at a viewport width, for the reference or the web side.
 * @param {SpecProp} prop
 * @param {number} width
 * @param {'ref' | 'web'} side
 * @returns {number | string | undefined}
 */
export function expectedAt(prop, width, side) {
  const { at } = prop;
  if (typeof at !== 'object') return at;
  return (side === 'ref' ? prop.refAt?.[width] : undefined) ?? at[width];
}

/** @type {(prop: string, at: SpecValue, extra?: {refAt?: Record<number, number>, deviation?: string}) => SpecProp} */
const p = (prop, at, extra = {}) => ({ prop, at, ...extra });
/** @type {(key: string, mode: SpecEntry['mode'], ref: string, props: SpecProp[], web?: string) => SpecEntry} */
const entry = (key, mode, ref, props, web = `[data-probe="${key}"]`) => ({ key, mode, ref, web, props });

const INICIO = 'section#inicio';
const SECTION = 'body > div > section:not(#inicio)';
const ALT = 'body > div > section:nth-of-type(3)';
const FEATURED = 'section#proyectos article';

/** Entries: `mode` is the page mode where the element exists (`both` = perfil and servicios). */
/** @type {SpecEntry[]} */
export const SPEC = [
  entry('page', 'both', 'body > div', [
    p('backgroundColor', '{bg}'), p('color', '{ink}'), p('fontFamily', 'IBM Plex Sans'), p('fontSize', 16), p('lineHeight', 25.6),
  ]),
  entry('header', 'both', 'header', [
    p('position', 'sticky'), p('top', 0), p('zIndex', '10'), p('backgroundColor', '{bg}'), p('borderBottomWidth', 1),
  ]),
  entry('header-nav', 'both', 'header nav', [
    p('maxWidth', 1280), p('paddingTop', 14), p('paddingLeft', 24), p('paddingBottom', 14),
  ]),
  entry('logo', 'both', 'header nav > a:first-child', [p('minHeight', 44), p('columnGap', 12)]),
  entry('logo-mark', 'both', 'header nav > a:first-child .hex', [
    p('rect.width', 38), p('rect.height', 44), p('backgroundColor', '{accent}'), p('color', '{accent-ink}'),
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '700'), p('fontSize', 18),
  ]),
  entry('logo-name', 'both', 'header nav > a:first-child .d:not(.hex)', [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 24), p('letterSpacing', 0.48),
  ]),
  entry('navlinks', 'both', 'header nav a.m', [p('fontFamily', 'IBM Plex Mono'), p('fontSize', 14), p('minHeight', 44)]),
  entry('toggle', 'both', 'header [role="group"]', [p('borderTopWidth', 1)]),
  // The active segment (accent fill) is the one measured; the inactive one is transparent in both modes.
  entry('toggle-button', 'both', 'header [role="group"] button[aria-pressed="true"]', [
    p('minHeight', 44), p('minWidth', 44), p('paddingLeft', 18), p('fontFamily', 'IBM Plex Mono'), p('fontSize', 14), p('fontWeight', '500'),
    p('backgroundColor', '{accent}'), p('color', '{accent-ink}'),
  ], '[data-probe="toggle-button"][aria-current="page"]'),
  entry('hero', 'both', INICIO, [p('borderBottomWidth', 1), p('backgroundSize', '84px 48.5px')]),
  entry('hero-inner', 'both', `${INICIO} > div:first-child`, [
    p('maxWidth', 1280), p('paddingTop', 72), p('paddingLeft', 24), p('paddingBottom', 80), p('columnGap', 56),
  ]),
  entry('eyebrow', 'both', `${INICIO} p.m`, [
    p('fontFamily', 'IBM Plex Mono'), p('fontSize', 13), p('fontWeight', '500'), p('paddingTop', 4), p('paddingLeft', 10),
    p('backgroundColor', '{accent}'), p('color', '{accent-ink}'),
  ]),
  entry('h1', 'both', `${INICIO} h1`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '700'), p('textTransform', 'uppercase'),
    p('fontSize', { 1440: 120.96, 390: 56 }), p('lineHeight', { 1440: 108.864, 390: 50.4 }),
    p('letterSpacing', { 1440: -0.6048, 390: -0.28 }),
  ]),
  entry('lead', 'both', `${INICIO} h1 + p`, [p('fontSize', 18), p('color', '{muted}'), p('maxWidth', 540)]),
  entry('cta', 'both', `${INICIO} a[href="#contacto"]`, [
    p('minHeight', 52), p('paddingLeft', 28), p('fontWeight', '600'), p('backgroundColor', '{accent}'), p('color', '{accent-ink}'),
  ]),
  entry('cta-secondary', 'both', `${INICIO} a[href="#proyectos"]`, [
    p('minHeight', 52), p('paddingLeft', 28), p('fontWeight', '500'), p('borderTopWidth', 1), p('backgroundColor', '{bg}'),
  ]),
  entry('plano', 'both', `${INICIO} svg[viewBox="0 0 100 100"]`, [
    p('rect.width', { 1440: 540, 390: 342 }), p('rect.height', { 1440: 540, 390: 342 }),
  ]),
  entry('core', 'both', `${INICIO} .hex:not(.node)`, [
    p('rect.width', { 1440: 162, 390: 102.6 }), p('backgroundColor', '{accent}'), p('color', '{accent-ink}'),
  ]),
  entry('core-tag', 'both', `${INICIO} .hex:not(.node) .m`, [p('fontFamily', 'IBM Plex Mono'), p('fontSize', 11), p('fontWeight', '500')]),
  entry('core-label', 'both', `${INICIO} .hex:not(.node) .d`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '700'), p('fontSize', { 1440: 30, 390: 18 }),
  ]),
  entry('node', 'both', `${INICIO} button.node`, [
    p('rect.width', { 1440: 108, 390: 68.4 }), p('minHeight', 48), p('fontFamily', 'IBM Plex Sans'), p('fontWeight', '600'),
    // D1: the web keeps node text at >= 12 px; the design drops to 11 px on narrow screens.
    p('fontSize', { 1440: 15, 390: 12 }, { refAt: { 390: 11 }, deviation: 'D1' }),
  ]),
  entry('legend', 'both', `${INICIO} div.m[style*="gap: 8px 20px"]`, [
    p('fontFamily', 'IBM Plex Mono'), p('fontSize', 12), p('color', '{muted}'), p('columnGap', 20), p('rowGap', 8), p('maxWidth', 540),
  ]),
  entry('panel', 'both', `${INICIO} div[style*="box-sizing: border-box; border: 1px solid var(--line)"]`, [
    p('maxWidth', 540), p('borderTopWidth', 1), p('backgroundColor', '{bg}'),
  ]),
  entry('panel-index', 'both', `${INICIO} div.m[style*="border-right"]`, [
    p('fontSize', 12), p('paddingTop', 14), p('paddingLeft', 16), p('borderRightWidth', 1),
  ]),
  entry('panel-name', 'both', `${INICIO} span.d[style*="font-size: 22px"]`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 22), p('lineHeight', 24.2),
  ]),
  entry('panel-text', 'both', `${INICIO} span[style*="font-size: 15px; color: var(--muted)"]`, [p('fontSize', 15), p('color', '{muted}')]),
  entry('cajetin', 'both', `${INICIO} > div:last-child`, [p('borderTopWidth', 1), p('backgroundColor', '{bg}')]),
  entry('cajetin-cell', 'both', `${INICIO} dl > div:nth-child(2)`, [p('paddingTop', 16), p('paddingLeft', 16), p('borderLeftWidth', 1)]),
  entry('cajetin-dt', 'both', `${INICIO} dt`, [
    p('fontFamily', 'IBM Plex Mono'), p('fontSize', 11), p('textTransform', 'uppercase'), p('letterSpacing', 0.88), p('color', '{muted}'),
  ]),
  entry('cajetin-dd', 'both', `${INICIO} dd`, [p('fontWeight', '500')]),
  entry('section', 'both', SECTION, [p('borderBottomWidth', 1)]),
  entry('section-inner', 'both', `${SECTION} > div`, [
    p('maxWidth', 1280), p('paddingTop', 96), p('paddingLeft', 24), p('paddingBottom', 96),
  ]),
  entry('section-alt', 'both', ALT, [p('backgroundColor', '{bg2}')]),
  entry('h2', 'both', `${SECTION} h2`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('textTransform', 'uppercase'),
    p('fontSize', { 1440: 64, 390: 40 }), p('lineHeight', { 1440: 60.8, 390: 38 }),
  ]),
  entry('timeline', 'perfil', `${SECTION} ol`, [p('borderLeftWidth', 1), p('paddingLeft', 28)]),
  entry('timeline-marker', 'perfil', `${SECTION} ol li:first-child > span[aria-hidden]`, [
    p('rect.width', 13), p('rect.height', 13), p('backgroundColor', '{accent}'),
  ]),
  entry('timeline-period', 'perfil', `${SECTION} ol li .m`, [p('fontFamily', 'IBM Plex Mono'), p('fontSize', 14), p('color', '{muted}')]),
  entry('timeline-title', 'perfil', `${SECTION} ol li h3`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 28), p('lineHeight', 29.4),
  ]),
  entry('layers', 'perfil', `${ALT} > div > div:nth-child(2)`, [p('borderTopWidth', 1), p('paddingTop', 24), p('rowGap', 20)]),
  entry('layers-mid', 'perfil', `${ALT} div[style*="1px dashed"]`, [p('borderTopStyle', 'dashed'), p('paddingTop', 24)]),
  entry('layers-core', 'perfil', `${ALT} div[style*="color: #0A2016; padding: 24px"]`, [
    p('backgroundColor', '{accent}'), p('color', '{accent-ink}'), p('paddingTop', 24),
  ]),
  entry('layers-title', 'perfil', `${ALT} h3`, [p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 26)]),
  entry('layers-core-title', 'perfil', `${ALT} div[style*="color: #0A2016; padding: 24px"] h3`, [p('fontWeight', '700'), p('fontSize', 30)]),
  entry('service-card', 'servicios', `${SECTION} button[aria-pressed]`, [
    p('minHeight', 230), p('paddingTop', 24), p('borderTopWidth', 2), p('backgroundColor', '{surface}'), p('rowGap', 14),
    p('boxShadow', '{accent} 8px 8px 0px 0px'),
  ]),
  entry('service-card-title', 'servicios', `${SECTION} button[aria-pressed] .d`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 30), p('lineHeight', 30),
  ]),
  entry('service-card-price', 'servicios', `${SECTION} button[aria-pressed] .m:last-child`, [
    p('fontFamily', 'IBM Plex Mono'), p('fontSize', 14), p('fontWeight', '500'),
  ]),
  entry('aside', 'servicios', 'aside', [p('backgroundColor', '{ink}'), p('color', '{bg}'), p('paddingTop', 28), p('paddingLeft', 28), p('rowGap', 16)]),
  entry('aside-row', 'servicios', 'aside li', [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 26), p('borderBottomWidth', 1),
  ]),
  entry('process', 'servicios', `${ALT} ol`, [p('borderTopWidth', 1)]),
  entry('process-number', 'servicios', `${ALT} ol li span.d`, [p('fontFamily', 'Barlow Condensed'), p('fontWeight', '700'), p('fontSize', 56)]),
  entry('process-title', 'servicios', `${ALT} ol li h3`, [p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 26)]),
  entry('featured', 'both', FEATURED, [p('borderTopWidth', 1), p('backgroundColor', '{surface}')]),
  entry('featured-left', 'both', `${FEATURED} > div:first-child`, [p('paddingTop', 40), p('paddingLeft', 40), p('rowGap', 24)]),
  entry('featured-title', 'both', `${FEATURED} h3`, [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '700'),
    p('fontSize', { 1440: 100.8, 390: 56 }), p('lineHeight', { 1440: 88.704, 390: 49.28 }),
  ]),
  entry('featured-facts', 'both', `${FEATURED} ul`, [p('borderTopWidth', 1)]),
  entry('featured-side', 'both', `${FEATURED} > div.gridbg`, [
    p('paddingTop', 40), p('borderLeftWidth', 1), p('backgroundSize', '84px 48.5px'),
  ]),
  entry('card', 'both', 'section#proyectos > div > div:last-child > a', [p('borderTopWidth', 1), p('backgroundColor', '{surface}')]),
  entry('card-body', 'both', 'section#proyectos > div > div:last-child > a > div:last-child', [p('paddingTop', 24), p('rowGap', 8), p('borderTopWidth', 1)]),
  entry('card-title', 'both', 'section#proyectos > div > div:last-child > a h3', [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '600'), p('fontSize', 30), p('lineHeight', 30),
  ]),
  entry('contact', 'both', 'section#contacto', [p('backgroundColor', '{bg2}')]),
  entry('contact-title', 'both', 'section#contacto h2', [
    p('fontFamily', 'Barlow Condensed'), p('fontWeight', '700'),
    p('fontSize', { 1440: 92.16, 390: 48 }), p('lineHeight', { 1440: 82.944, 390: 43.2 }),
  ]),
  entry('contact-form', 'both', 'section#contacto form', [
    p('paddingTop', 32), p('borderTopWidth', 1), p('backgroundColor', '{surface}'), p('rowGap', 16),
  ]),
  entry('contact-field', 'both', 'section#contacto input', [
    p('minHeight', 48), p('paddingLeft', 14), p('borderTopWidth', 1), p('borderTopLeftRadius', 0), p('backgroundColor', '{field}'), p('fontSize', 15),
  ]),
  entry('contact-button', 'both', 'section#contacto form button', [
    p('minHeight', 52), p('backgroundColor', '{accent}'), p('color', '{accent-ink}'), p('fontWeight', '600'),
  ]),
  entry('footer', 'both', 'footer', [p('borderTopWidth', 1)]),
  entry('footer-inner', 'both', 'footer > div', [
    p('fontFamily', 'IBM Plex Mono'), p('fontSize', 13), p('color', '{muted}'), p('paddingTop', 28), p('paddingLeft', 24),
  ]),
];
