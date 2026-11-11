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
  it('HX-T36: without ports, or with ports that have no adapters, there is no plane, legend or panel and the hero has one column', () => {
    expect(buildHexPlane(EMPTY_ARCHITECTURE, dict)).toBeNull();
    const withoutAdapters = { core: { name: 'C', description: null }, ports: [{ id: 'p', name: 'P', description: null, adapters: [] }] };
    expect(buildHexPlane(withoutAdapters, dict)).toBeNull();
    expect(buildHexPlane(architectureOf(2), dict)).not.toBeNull();

    for (const architecture of [EMPTY_ARCHITECTURE, withoutAdapters, null]) {
      for (const page of ['profile', 'services'] as const) {
        const { container, unmount } = render(
          <HomeView resume={resumeEs} architecture={architecture} route={{ lang: 'es', page }} siteUrl={SITE} apiUrl="http://api.example.test" />,
        );
        expect(columns(container), page).toBe('1');
        for (const probe of ['plane', 'panel', 'legend', 'core']) expect(container.querySelector(`[data-probe="${probe}"]`)).toBeNull();
        unmount();
      }
    }
  });

  it('HX-T36: with ports the hero has two columns in both modes, and the plane is the same one', () => {
    const texts: string[] = [];
    for (const page of ['profile', 'services'] as const) {
      const { container, unmount } = render(
        <HomeView resume={resumeEs} architecture={architectureEs} route={{ lang: 'es', page }} siteUrl={SITE} apiUrl="http://api.example.test" />,
      );
      expect(columns(container), page).toBe('2');
      texts.push(container.querySelector('[data-probe="plane"]')?.textContent ?? '');
      unmount();
    }
    expect(texts[0]).toBe(texts[1]);
    expect(texts[0]).toContain('Base de datos de ejemplo');
  });
});
