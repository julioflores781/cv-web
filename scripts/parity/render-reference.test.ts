// @vitest-environment node
import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderReference } from './render-reference.mjs';

type Html = string;

const dom = (html: Html) => new JSDOM(html).window.document;

describe('render-reference', () => {
  let perfil: Html;
  let servicios: Html;
  let variant: Html;

  beforeAll(async () => {
    perfil = await renderReference({ mode: 'perfil', sel: 0, picks: { 0: true } });
    servicios = await renderReference({ mode: 'servicios', sel: 0, picks: { 0: true } });
    variant = await renderReference({ mode: 'servicios', sel: 3, picks: { 1: true, 2: true } });
  });

  // RF-T1 (RF-A1)
  it('RF-T1: profile render has the h1, six node buttons with the first pressed and no template residue', () => {
    const doc = dom(perfil);
    expect(doc.querySelector('h1')?.textContent).toMatch(/^Construyo el núcleo/);
    const nodes = [...doc.querySelectorAll('button.node')];
    expect(nodes).toHaveLength(6);
    expect(nodes.map((node) => node.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false']);
    expect(perfil).not.toContain('{{');
    expect(perfil).not.toMatch(/sc-if|sc-for/);
  });

  // RF-T2 (RF-A1)
  it('RF-T2: services render has 4 cards (first pressed), obra class and one aside li per pressed card', () => {
    const doc = dom(servicios);
    expect(doc.querySelector('body > div')?.classList.contains('obra')).toBe(true);
    const cards = [...doc.querySelectorAll('section:not(#inicio) button[aria-pressed]')];
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    const aside = doc.querySelector('aside');
    expect(aside?.textContent).toContain('Tu encargo');
    expect(aside?.querySelectorAll('li')).toHaveLength(1);
  });

  // RF-T3 (RF-A1)
  it('RF-T3: other state (sel=3, picks 1 and 2) is reflected in node, index and aside', () => {
    const doc = dom(variant);
    const nodes = [...doc.querySelectorAll('button.node')];
    expect(nodes[3]?.getAttribute('aria-pressed')).toBe('true');
    expect(nodes.filter((node) => node.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(doc.body.textContent).toContain('04 / 06');
    expect(doc.querySelectorAll('aside li')).toHaveLength(2);
  });

  // RF-T4 (RF-A1, RF-A2)
  it('RF-T4: no blobs or Google Fonts, and @font-face points at app/fonts', () => {
    for (const html of [perfil, servicios, variant]) {
      expect(html).not.toContain('/_blob/');
      expect(html).not.toContain('fonts.googleapis.com');
      expect(html).not.toContain('fonts.gstatic.com');
      expect(html).toMatch(/@font-face\{[^}]*src:url\(\/app\/fonts\/[a-z0-9-]+\.woff2\)/);
      expect(html).toContain('/hex-grid-plano.svg');
    }
    expect(servicios).toContain('/hex-grid-obra.svg');
  });
});
