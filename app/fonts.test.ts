// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, readText } from '@/tests/helpers/css';

const FONTS = path.join(ROOT, 'app', 'fonts');
const source = readText('app/fonts.ts');

const EXPECTED = [
  'barlow-condensed-latin-600-normal.woff2',
  'barlow-condensed-latin-700-normal.woff2',
  'ibm-plex-sans-latin-400-normal.woff2',
  'ibm-plex-sans-latin-500-normal.woff2',
  'ibm-plex-sans-latin-600-normal.woff2',
  'ibm-plex-mono-latin-400-normal.woff2',
  'ibm-plex-mono-latin-500-normal.woff2',
];

describe('fonts', () => {
  it('BA-T12: app/fonts.ts uses next/font/local with exactly the 7 files, swap, one variable per role and no Google', () => {
    expect(source).toContain("from 'next/font/local'");
    const used = [...source.matchAll(/path:\s*'\.\/fonts\/([^']+)'/g)].map((match) => match[1]);
    expect([...used].sort()).toEqual([...EXPECTED].sort());
    expect(readdirSync(FONTS).sort()).toEqual([...EXPECTED].sort());
    expect(source.match(/display:\s*'swap'/g)).toHaveLength(3);
    for (const variable of ['--face-head', '--face-text', '--face-mono']) expect(source).toContain(`variable: '${variable}'`);
    expect(source).not.toMatch(/googleapis|gstatic|next\/font\/google/);
  });

  it('BA-T13: each woff2 is byte-identical to the one in node_modules/@fontsource/<family>/files', () => {
    for (const file of EXPECTED) {
      const family = file.replace(/-latin-.*$/, '');
      const original = readFileSync(path.join(ROOT, 'node_modules', '@fontsource', family, 'files', file));
      expect(readFileSync(path.join(FONTS, file)).equals(original), file).toBe(true);
    }
  });
});
