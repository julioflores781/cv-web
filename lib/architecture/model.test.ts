import { describe, expect, it } from 'vitest';
import type { Architecture } from '@/lib/api/types';
import { adapter, architectureEs, architectureOf } from '@/tests/fixtures/content';
import { buildHexModel } from './model';
import { MAX_RADIAL, POSITIONS, SLOTS } from './slots';

describe('buildHexModel', () => {
  it('HX-T21: drops ports without adapters and adapters without a name, trims the text and keeps the order; no ports gives null', () => {
    const architecture: Architecture = {
      core: { name: '  Núcleo  ', description: null },
      ports: [
        { id: 'a', name: '  Uno  ', description: '  texto  ', adapters: [adapter('x', { name: '  Alfa ' }), adapter('y', { name: '   ' })] },
        { id: 'b', name: 'Sin adaptadores', description: null, adapters: [] },
        { id: 'c', name: 'Solo sin nombre', description: null, adapters: [adapter('z', { name: '' })] },
        { id: 'd', name: 'Dos', description: '   ', adapters: [adapter('w', { name: 'Beta', note: '  nota ' })] },
      ],
    };
    const model = buildHexModel(architecture);
    expect(model?.core.name).toBe('Núcleo');
    expect(model?.ports.map((port) => port.name)).toEqual(['Uno', 'Dos']);
    expect(model?.ports[0]).toMatchObject({ description: 'texto', adapters: [{ name: 'Alfa' }] });
    expect(model?.ports[1]).toMatchObject({ description: null, adapters: [{ name: 'Beta', note: 'nota' }] });
    expect(buildHexModel({ core: { name: 'C', description: null }, ports: [] })).toBeNull();
    expect(buildHexModel(architectureOf(0))).toBeNull();
    expect(buildHexModel({ ...architectureOf(2), ports: [{ id: 'a', name: 'A', description: null, adapters: [] }] })).toBeNull();
    expect(JSON.stringify(buildHexModel(architectureEs))).not.toContain('store-alpha');
  });

  it('HX-T22: 1 to 6 ports are radial; 7 are a list with all of them', () => {
    for (let count = 1; count <= MAX_RADIAL; count += 1) {
      const model = buildHexModel(architectureOf(count));
      expect(model?.layout, `${count}`).toBe('radial');
      expect(model?.slots).toHaveLength(count);
    }
    const seven = buildHexModel(architectureOf(7));
    expect(seven?.layout).toBe('list');
    expect(seven?.ports).toHaveLength(7);
    expect(seven?.slots).toEqual([]);
  });
});

describe('SLOTS', () => {
  it('HX-T23: N ports take N distinct valid positions, exactly the table of the plan', () => {
    expect(SLOTS).toEqual({ 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [1, 2, 4, 5], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] });
    for (let count = 1; count <= 6; count += 1) {
      const slots = SLOTS[count] ?? [];
      expect(new Set(slots).size).toBe(count);
      for (const slot of slots) expect(slot >= 0 && slot < POSITIONS.length).toBe(true);
    }
    expect(POSITIONS).toEqual([[50, 12], [82.9, 31], [82.9, 69], [50, 88], [17.1, 69], [17.1, 31]]);
  });
});
