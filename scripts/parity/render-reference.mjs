// @ts-check
// Renders the v2 design artifact (`Main.dc.html`) into plain static HTML.
//
// The artifact needs `support.js` (the "dc" runtime), which is not in the repo. Instead of faking it, this script
// evaluates the artifact's own `Component` class with a minimal `DCLogic` and expands the template
// (`sc-if`, `sc-for`, `{{expr}}`) over a jsdom tree. The output uses the same woff2 files and hex-grid SVGs as the web.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { isMain, ROOT } from './common.mjs';

export const DESIGN_FILE = path.join(ROOT, 'design/artifact-v2/project/Main.dc.html');
export const RENDERED_DIR = path.join(ROOT, 'design/artifact-v2/.rendered');

/** URL prefix under which `serve.mjs` exposes `app/fonts/`. */
export const FONT_URL_PREFIX = '/app/fonts/';

const FONT_FACES = [
  ['Barlow Condensed', 600, 'barlow-condensed-latin-600-normal'],
  ['Barlow Condensed', 700, 'barlow-condensed-latin-700-normal'],
  ['IBM Plex Sans', 400, 'ibm-plex-sans-latin-400-normal'],
  ['IBM Plex Sans', 500, 'ibm-plex-sans-latin-500-normal'],
  ['IBM Plex Sans', 600, 'ibm-plex-sans-latin-600-normal'],
  ['IBM Plex Mono', 400, 'ibm-plex-mono-latin-400-normal'],
  ['IBM Plex Mono', 500, 'ibm-plex-mono-latin-500-normal'],
];

/**
 * @typedef {{mode: 'perfil' | 'servicios', sel: number, picks: Record<number, boolean>}} DesignState
 * @typedef {Record<string, unknown>} Scope
 */

/** The two hex-grid blobs of the artifact, replaced by the repo's own SVGs (plano first, obra second). */
/** @type {[string, string][]} */
const BLOB_REPLACEMENTS = [
  ['/_blob/5a2024960d66cec44b1431a7988db8fe', '/hex-grid-plano.svg'],
  ['/_blob/348ba5771fda6fc3fe32032823301d3e', '/hex-grid-obra.svg'],
];

/**
 * Default state of the design plus the variants other slugs compare against.
 * @type {(DesignState & {name: string})[]}
 */
export const VARIANTS = [
  { name: 'perfil', mode: 'perfil', sel: 0, picks: { 0: true } },
  { name: 'servicios', mode: 'servicios', sel: 0, picks: { 0: true } },
  { name: 'perfil-sel2', mode: 'perfil', sel: 2, picks: { 0: true } },
  { name: 'servicios-sel3-picks12', mode: 'servicios', sel: 3, picks: { 1: true, 2: true } },
  { name: 'servicios-sin-seleccion', mode: 'servicios', sel: 0, picks: {} },
];

const FONT_FACE_CSS = FONT_FACES.map(
  ([family, weight, file]) =>
    `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;` +
    `src:url(${FONT_URL_PREFIX}${file}.woff2) format('woff2')}`,
).join('\n');

class DCLogic {
  /** @param {Record<string, unknown>} props */
  constructor(props) {
    this.props = props;
    /** @type {Record<string, unknown>} */
    this.state = {};
  }

  /** @param {Record<string, unknown>} patch */
  setState(patch) {
    Object.assign(this.state, patch);
  }
}

/**
 * Evaluates the artifact's `Component` and returns its `renderVals()` for the given state.
 * @param {string} scriptText
 * @param {DesignState} state
 * @returns {Scope}
 */
function computeVals(scriptText, state) {
  const Component = new Function('DCLogic', `${scriptText}\nreturn Component;`)(DCLogic);
  const instance = new Component({});
  Object.assign(instance.state, { mode: state.mode, sel: state.sel, picks: state.picks });
  return instance.renderVals();
}

const PATH_RE = /^[\w.]+$/;

/**
 * @param {string | undefined} expr
 * @param {Scope} scope
 * @returns {unknown}
 */
function lookup(expr, scope) {
  const trimmed = (expr ?? '').trim();
  if (!PATH_RE.test(trimmed)) throw new Error(`Unsupported template expression: {{${expr}}}`);
  return trimmed
    .split('.')
    .reduce((value, key) => (value == null ? undefined : /** @type {Scope} */ (value)[key]), /** @type {unknown} */ (scope));
}

const WHOLE_RE = /^\s*\{\{([^}]+)\}\}\s*$/;
const INLINE_RE = /\{\{([^}]+)\}\}/g;

/**
 * @param {Element} el
 * @param {Scope} scope
 */
function expandAttributes(el, scope) {
  for (const attr of [...el.attributes]) {
    if (!attr.value.includes('{{')) continue;
    const whole = WHOLE_RE.exec(attr.value);
    if (whole) {
      const value = lookup(whole[1], scope);
      if (value == null || typeof value === 'function') el.removeAttribute(attr.name);
      else el.setAttribute(attr.name, String(value));
    } else {
      el.setAttribute(attr.name, attr.value.replace(INLINE_RE, (_, expr) => String(lookup(expr, scope) ?? '')));
    }
  }
}

/**
 * @param {ParentNode} parent
 * @param {Scope} scope
 */
function expandChildren(parent, scope) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === 3) {
      node.textContent = (node.textContent ?? '').replace(INLINE_RE, (_, expr) => String(lookup(expr, scope) ?? ''));
    }
  }
  for (const child of [...parent.children]) expandElement(child, scope);
}

/**
 * @param {Element} el
 * @param {Scope} scope
 */
function expandElement(el, scope) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'sc-if') {
    const whole = WHOLE_RE.exec(el.getAttribute('value') ?? '');
    if (!whole) throw new Error('sc-if without a {{expr}} value');
    if (lookup(whole[1], scope)) {
      expandChildren(el, scope);
      el.replaceWith(...el.childNodes);
    } else {
      el.remove();
    }
    return;
  }
  if (tag === 'sc-for') {
    const whole = WHOLE_RE.exec(el.getAttribute('list') ?? '');
    const as = el.getAttribute('as');
    if (!whole || !as) throw new Error('sc-for needs list="{{expr}}" and as');
    const list = lookup(whole[1], scope);
    if (!Array.isArray(list)) throw new Error(`sc-for list is not an array: ${whole[1]}`);
    const fragments = list.map((/** @type {unknown} */ item) => {
      const fragment = el.ownerDocument.createDocumentFragment();
      for (const child of el.childNodes) fragment.append(child.cloneNode(true));
      expandChildren(fragment, { ...scope, [as]: item });
      return fragment;
    });
    el.replaceWith(...fragments);
    return;
  }
  expandAttributes(el, scope);
  expandChildren(el, scope);
}

/**
 * Renders one state of the design as a standalone HTML document.
 * @param {DesignState} state
 * @param {string} [source] The artifact HTML; defaults to the file in the repo.
 * @returns {Promise<string>}
 */
export async function renderReference(state, source) {
  const html = source ?? (await readFile(DESIGN_FILE, 'utf8'));
  const { document } = new JSDOM(html).window;
  const scriptText = document.querySelector('script[data-dc-script]')?.textContent;
  if (!scriptText) throw new Error('The artifact has no script[data-dc-script]');
  const vals = computeVals(scriptText, state);

  const helmetCss = [...document.querySelectorAll('helmet style')].map((style) => style.textContent ?? '').join('\n');
  const css = BLOB_REPLACEMENTS.reduce((text, [from, to]) => text.replaceAll(from, to), helmetCss);

  const root = document.querySelector('x-dc');
  if (!root) throw new Error('The artifact has no <x-dc> root');
  root.querySelector('helmet')?.remove();
  expandChildren(root, vals);

  const out =
    `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${document.title}</title>\n<style>\n${FONT_FACE_CSS}\n${css}\n</style>\n</head>\n` +
    `<body>\n${root.innerHTML}\n</body>\n</html>\n`;

  const leftover = /\{\{|<sc-if|<sc-for/.exec(out);
  if (leftover) throw new Error(`Unexpanded template syntax left in the render: ${leftover[0]}`);
  return out;
}

/** Writes every variant into `outDir` (only ever `.rendered/`) and returns the written file paths. */
export async function writeAllVariants(outDir = RENDERED_DIR) {
  await mkdir(outDir, { recursive: true });
  const files = [];
  for (const variant of VARIANTS) {
    const file = path.join(outDir, `${variant.name}.html`);
    await writeFile(file, await renderReference(variant));
    files.push(file);
  }
  return files;
}

if (isMain(import.meta.url)) {
  const files = await writeAllVariants();
  process.stdout.write(`${files.map((file) => path.relative(ROOT, file)).join('\n')}\n`);
}
