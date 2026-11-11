// @vitest-environment node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PALETTE: Record<string, string> = { plano: '#F1F6EE', obra: '#12382A' };

describe('hex-grid backgrounds', () => {
  // RF-T11 (RF-A7)
  it.each(Object.keys(PALETTE))('RF-T11: hex-grid-%s.svg is 84x48.5, stroke-only, palette colours, no external references', async (name) => {
    const svg = await readFile(path.resolve(__dirname, `../../public/hex-grid-${name}.svg`), 'utf8');
    expect(svg).toMatch(/<svg[^>]*\swidth="84"/);
    expect(svg).toMatch(/<svg[^>]*\sheight="48\.5"/);
    expect(svg).toContain('viewBox="0 0 84 48.5"');
    expect(svg).not.toMatch(/<image|href=|url\(|<script/i);
    const colours = [...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0].toUpperCase());
    expect(colours.length).toBeGreaterThan(0);
    expect(new Set(colours)).toEqual(new Set([PALETTE[name]]));
    expect(svg).toContain('fill="none"');
  });

  // RF-T11 (RF-A7): each edge is drawn once, otherwise the shared edges compose their alpha and the mesh is uneven.
  it.each(Object.keys(PALETTE))('RF-T11: hex-grid-%s.svg draws every edge once, in a single stroked element', async (name) => {
    const svg = await readFile(path.resolve(__dirname, `../../public/hex-grid-${name}.svg`), 'utf8');
    expect(svg).not.toContain('<polygon');
    expect(svg.match(/stroke-opacity=/g)).toHaveLength(1);
    const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)];
    expect(paths).toHaveLength(1);

    // Parse the absolute M/H/L path into segments and check they are unique and make up the lattice edges of one tile.
    const tokens = (paths[0]?.[1] ?? '').match(/[MHL]|-?\d+(?:\.\d+)?/g) ?? [];
    const segments: string[] = [];
    let current: [number, number] = [0, 0];
    for (let i = 0; i < tokens.length; ) {
      const command = tokens[i++];
      const first = Number(tokens[i++]);
      const next: [number, number] = command === 'H' ? [first, current[1]] : [first, Number(tokens[i++])];
      if (command !== 'M') segments.push([current, next].map((point) => point.join(',')).sort().join('>'));
      current = next;
    }
    expect(new Set(segments).size).toBe(segments.length);
    // 4 diagonals + the y=0 and y=48.5 horizontals (each clipped to half a stroke inside the tile) + the y=24.25 line in 2 pieces.
    expect(segments).toHaveLength(8);
  });
});
