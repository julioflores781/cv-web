// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { probe, probeScript } from './probe.mjs';
import { renderReference } from './render-reference.mjs';
import { SPEC, VIEWPORTS } from './spec.mjs';

const MODES = ['perfil', 'servicios'] as const;

function expectedPx(key: string, prop: string): Record<number, number> {
  const at = SPEC.find((entry) => entry.key === key)?.props.find((candidate) => candidate.prop === prop)?.at;
  if (typeof at !== 'object') throw new Error(`${key}.${prop} has no per-viewport values`);
  return at;
}

describe('spec', () => {
  // RF-T8 (RF-A5)
  it('RF-T8: every key has ref and web selectors and the clamps carry the 1440/390 numbers of the plan', () => {
    expect(new Set(SPEC.map((entry) => entry.key)).size).toBe(SPEC.length);
    const { document } = new JSDOM('<body></body>').window;
    for (const entry of SPEC) {
      // A qualifier may follow the probe attribute (e.g. the active toggle segment).
      expect(entry.web.startsWith(`[data-probe="${entry.key}"]`), entry.key).toBe(true);
      expect(entry.ref, entry.key).not.toBe('');
      expect(() => document.querySelector(entry.ref), `${entry.key} ref selector`).not.toThrow();
      expect(() => document.querySelector(entry.web), `${entry.key} web selector`).not.toThrow();
    }
    expect(VIEWPORTS).toEqual([1440, 390]);
    expect(expectedPx('h1', 'fontSize')).toEqual({ 1440: 120.96, 390: 56 });
    expect(expectedPx('h1', 'lineHeight')).toEqual({ 1440: 108.864, 390: 50.4 });
    expect(expectedPx('h2', 'fontSize')).toEqual({ 1440: 64, 390: 40 });
    expect(expectedPx('contact-title', 'fontSize')).toEqual({ 1440: 92.16, 390: 48 });
    expect(expectedPx('featured-title', 'fontSize')).toEqual({ 1440: 100.8, 390: 56 });
    expect(expectedPx('core-label', 'fontSize')).toEqual({ 1440: 30, 390: 18 });
    expect(expectedPx('node', 'fontSize')).toEqual({ 1440: 15, 390: 12 });
    expect(expectedPx('plano', 'rect.width')).toEqual({ 1440: 540, 390: 342 });
    expect(expectedPx('core', 'rect.width')).toEqual({ 1440: 162, 390: 102.6 });
    expect(expectedPx('node', 'rect.width')).toEqual({ 1440: 108, 390: 68.4 });
  });

  // RF-T9 (RF-A5)
  it('RF-T9: the probe finds every ref-selector key in the reference render', async () => {
    for (const mode of MODES) {
      const html = await renderReference({ mode, sel: 0, picks: { 0: true } });
      const { document } = new JSDOM(html).window;
      const result = probe(document, SPEC, 'ref', mode);
      const expected = SPEC.filter((entry) => entry.mode === 'both' || entry.mode === mode);
      expect(Object.keys(result).sort()).toEqual(expected.map((entry) => entry.key).sort());
      for (const entry of expected) {
        expect(result[entry.key], `${mode}:${entry.key}`).not.toBeNull();
      }
    }
  });

  // Extra test outside the plan: the script printed for evaluate_script must run on its own.
  it('serialised probe script is self-contained', () => {
    const html = '<body><div><h1>x</h1></div></body>';
    const { window } = new JSDOM(html, { runScripts: 'outside-only' });
    const run = window.eval(probeScript('ref', 'perfil')) as () => Record<string, unknown>;
    expect(Object.keys(run())).toContain('h1');
  });
});
