// @ts-check
// Browser probe: for each spec key, returns `getComputedStyle` + `getBoundingClientRect` of the matched element.
// `probe` must stay self-contained (no module-level references): `probeScript` serialises it for Chrome DevTools'
// `evaluate_script`. Usage: `node scripts/parity/probe.mjs <ref|web> <perfil|servicios>` prints that script.
import { isMain } from './common.mjs';
import { SPEC } from './spec.mjs';

/** @typedef {import('./spec.mjs').SpecEntry} SpecEntry */
/** @typedef {import('./spec.mjs').PageMode} PageMode */

/**
 * @typedef {{count: number, style: Record<string, string>, rect: {x: number, y: number, width: number, height: number}}} ProbeReading
 */

/**
 * @param {Document} doc
 * @param {SpecEntry[]} entries
 * @param {'ref' | 'web'} side
 * @param {PageMode} mode
 * @returns {Record<string, ProbeReading | null>}
 */
export function probe(doc, entries, side, mode) {
  const win = doc.defaultView;
  /** @type {Record<string, ProbeReading | null>} */
  const result = {};
  if (!win) return result;
  for (const entry of entries) {
    if (entry.mode !== 'both' && entry.mode !== mode) continue;
    const selector = entry[side];
    const el = doc.querySelector(selector);
    if (!el) {
      result[entry.key] = null;
      continue;
    }
    const computed = /** @type {Record<string, string>} */ (/** @type {unknown} */ (win.getComputedStyle(el)));
    /** @type {Record<string, string>} */
    const style = {};
    for (const { prop } of entry.props) {
      if (prop.startsWith('rect.')) continue;
      const value = String(computed[prop]);
      // The web names its families by role (`head|text|mono`); the reference by font. Normalise the web to the font name.
      const roles = { head: 'Barlow Condensed', text: 'IBM Plex Sans', mono: 'IBM Plex Mono' };
      const family = (value.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
      style[prop] = prop === 'fontFamily' ? (side === 'web' && family in roles ? roles[/** @type {'head'} */ (family)] : family) : value;
    }
    const box = el.getBoundingClientRect();
    result[entry.key] = {
      count: doc.querySelectorAll(selector).length,
      style,
      rect: { x: box.x, y: box.y + win.scrollY, width: box.width, height: box.height },
    };
  }
  return result;
}

/**
 * A JS arrow function (as text) that runs the probe in the page it is evaluated in.
 * @param {'ref' | 'web'} side
 * @param {PageMode} mode
 * @param {SpecEntry[]} [entries]
 * @returns {string}
 */
export function probeScript(side, mode, entries = SPEC) {
  return `() => (${probe.toString()})(document, ${JSON.stringify(entries)}, ${JSON.stringify(side)}, ${JSON.stringify(mode)})`;
}

if (isMain(import.meta.url)) {
  const [side, mode] = process.argv.slice(2);
  if ((side !== 'ref' && side !== 'web') || (mode !== 'perfil' && mode !== 'servicios')) {
    process.stderr.write('usage: probe.mjs <ref|web> <perfil|servicios>\n');
    process.exit(2);
  }
  process.stdout.write(`${probeScript(side, mode)}\n`);
}
