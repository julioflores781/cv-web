import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { EMPTY_ARCHITECTURE, architectureEs, architectureOf } from '@/tests/fixtures/content';
import { resumeEs } from '@/tests/fixtures/resume';
import { HomeView } from './home-view';
import { buildHexPlane } from './hex-plane-section';

const dict = getDictionary('es');
const SITE = 'https://cv.example.test';
const columns = (container: HTMLElement) => container.querySelector('[data-probe="hero-inner"]')?.getAttribute('data-columns');

describe('buildHexPlane', () => {
  it('HX-T36 / T51 / T45: without ports, or with ports that have no adapters, the plane block shows the empty state: no nodes, legend, panel or noscript', () => {
    const withoutAdapters = { core: { name: 'C', description: null }, ports: [{ id: 'p', name: 'P', description: null, adapters: [] }] };
    expect(buildHexPlane(architectureOf(2), dict)).not.toBeNull();

    for (const architecture of [EMPTY_ARCHITECTURE, withoutAdapters, null]) {
      for (const page of ['profile', 'services'] as const) {
        const { container, unmount } = render(
          <HomeView resume={resumeEs} architecture={architecture} route={{ lang: 'es', page }} siteUrl={SITE} />,
        );
        expect(columns(container), page).toBe('2');
        const plane = container.querySelector('[data-probe="plane-empty"]') as HTMLElement;
        expect(plane.getAttribute('role')).toBe('region');
        expect(plane.getAttribute('aria-label')).toBeTruthy();
        expect(plane).toHaveTextContent(dict.empty.architecture);
        for (const probe of ['plane', 'panel', 'legend', 'node']) expect(container.querySelector(`[data-probe="${probe}"]`)).toBeNull();
        expect(plane.querySelector('button, noscript')).toBeNull();
        unmount();
      }
    }
  });

  it('T45: with a core name only the central hexagon is drawn; without it only the text', () => {
    const withCore = render(buildHexPlane({ core: { name: 'Núcleo de ejemplo', description: null }, ports: [] }, dict));
    expect(withCore.container.querySelector('[data-probe="core"]')).toHaveTextContent('Núcleo de ejemplo');
    expect(withCore.container.querySelectorAll('svg polygon')).toHaveLength(3);
    expect(withCore.container.querySelector('svg line, svg rect, button')).toBeNull();
    expect(withCore.container).toHaveTextContent(dict.empty.architecture);
    withCore.unmount();
    for (const architecture of [EMPTY_ARCHITECTURE, { core: { name: '   ', description: null }, ports: [] }, null]) {
      const bare = render(buildHexPlane(architecture, dict));
      expect(bare.container.querySelector('svg, [data-probe="core"]')).toBeNull();
      expect(bare.container).toHaveTextContent(dict.empty.architecture);
      bare.unmount();
    }
  });

  it('HX-T36: with ports the hero has two columns in both modes, and the plane is the same one', () => {
    const texts: string[] = [];
    for (const page of ['profile', 'services'] as const) {
      const { container, unmount } = render(
        <HomeView resume={resumeEs} architecture={architectureEs} route={{ lang: 'es', page }} siteUrl={SITE} />,
      );
      expect(columns(container), page).toBe('2');
      texts.push(container.querySelector('[data-probe="plane"]')?.textContent ?? '');
      unmount();
    }
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toContain('Base de datos de ejemplo');
  });
});
