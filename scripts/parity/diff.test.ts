// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { diffBands } from './diff.mjs';

const WIDTH = 100;
const HEIGHT = 1000;

function page(blackBand?: number): Buffer {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y += 1) {
    const dark = blackBand !== undefined && Math.floor(y / 400) === blackBand;
    for (let x = 0; x < WIDTH; x += 1) {
      const at = (y * WIDTH + x) * 4;
      png.data.fill(dark ? 0 : 255, at, at + 3);
      png.data[at + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe('diff', () => {
  // RF-T10 (RF-A6)
  it('RF-T10: identical pages give 0 % and exit 0; a changed band exceeds 3 % and exits non-zero', async () => {
    const same = diffBands(page(), page());
    expect(same.bands).toHaveLength(3);
    expect(same.bands.every((band) => band.percent === 0)).toBe(true);
    expect(same.failed).toBe(false);

    const changed = diffBands(page(), page(1));
    expect(changed.bands[1]?.percent).toBeGreaterThan(3);
    expect(changed.bands[0]?.percent).toBe(0);
    expect(changed.failed).toBe(true);

    const dir = await mkdtemp(path.join(os.tmpdir(), 'parity-diff-'));
    const save = async (name: string, content: Buffer): Promise<string> => {
      const file = path.join(dir, name);
      await writeFile(file, content);
      return file;
    };
    const [a, b, c] = await Promise.all([save('a.png', page()), save('b.png', page()), save('c.png', page(1))]);
    const script = path.resolve(__dirname, 'diff.mjs');
    expect(spawnSync(process.execPath, [script, a, b]).status).toBe(0);
    expect(spawnSync(process.execPath, [script, a, c]).status).toBe(1);
  });
});
