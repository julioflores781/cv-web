import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { readText, rules } from '@/tests/helpers/css';
import { ArchitectureLayers } from './architecture-layers';

describe('ArchitectureLayers', () => {
  it('BA-T35: the 3 layers go adapters > ports > domain, from the outside in, and the central one is the accent block', () => {
    const dict = getDictionary('es');
    const { container } = render(<ArchitectureLayers dict={dict} />);
    const order = Array.from(container.querySelectorAll('[data-layer]')).map((node) => node.getAttribute('data-layer'));
    expect(order).toEqual(['adapters', 'ports', 'domain']);
    // Nesting: the domain sits inside the ports layer, which is inside the group.
    const ports = container.querySelector('[data-layer="ports"]');
    expect(ports?.querySelector('[data-layer="domain"]')).not.toBeNull();
    expect(screen.getByRole('group', { name: dict.layers.label })).toBeInTheDocument();
    for (const layer of [dict.layers.adapters, dict.layers.ports, dict.layers.domain]) {
      expect(screen.getByRole('heading', { level: 3, name: layer.title })).toBeInTheDocument();
    }
    expect(container.querySelector('[data-probe="layers-core"]')).toBe(container.querySelector('[data-layer="domain"]'));
  });

  it('BA-T35: the central layer is filled with the accent and uses the ink-on-accent text colour', () => {
    const core = rules(readText('components/architecture-layers.module.css')).find((rule) => rule.selector === '.core');
    expect(core?.body).toMatch(/background:\s*var\(--accent\)/);
    expect(core?.body).toMatch(/color:\s*var\(--accent-ink\)/);
  });
});
