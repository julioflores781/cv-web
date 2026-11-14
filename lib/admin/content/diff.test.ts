import { describe, expect, it } from 'vitest';
import { diffContent, diffDocuments, isEmptyDiff } from './diff';

const image = (n: number, alt = 'Alt') => ({ key: `site/projects/${n}.webp`, alt, width: 10, height: 10 });

describe('diff', () => {
  it('T310: added, removed, modified (fields) and reordered by id; images by key; key order does not matter', () => {
    const before = { projects: [{ id: 'a', title: 'A', summary: 'S', images: [image(1), image(2)] }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }] };
    const after = { projects: [{ id: 'c', title: 'C' }, { summary: 'S', images: [image(2, 'Otro'), image(3)], title: 'A2', id: 'a' }, { id: 'd', title: 'D' }] };
    const diff = diffDocuments('projects', before, after);
    expect(diff.added).toEqual(['d']);
    expect(diff.removed).toEqual(['b']);
    expect(diff.modified).toEqual([{ id: 'a', fields: ['images', 'title'], images: { added: ['site/projects/3.webp'], removed: ['site/projects/1.webp'] } }]);
    expect(diff.reordered).toBe(true);
    const shuffled = { projects: [{ title: 'B', id: 'b' }] };
    expect(isEmptyDiff(diffDocuments('projects', { projects: [{ id: 'b', title: 'B' }] }, shuffled))).toBe(true);
    const content = diffContent('services', { es: { services: [{ id: 'x', price: { from: 1, currency: 'EUR' } }] }, en: null }, { es: { services: [{ id: 'x', price: { currency: 'EUR', from: 2 } }] }, en: { services: [{ id: 'x' }] } });
    expect(content.es.modified).toEqual([{ id: 'x', fields: ['price'] }]);
    expect(content.en.added).toEqual(['x']);
    expect(diffDocuments('architecture', { core: { name: 'A' }, ports: [] }, { core: { name: 'B' }, ports: [] }).modified).toEqual([{ id: 'core', fields: ['name'] }]);
  });
});
