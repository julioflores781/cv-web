// @ts-check
// Pixel diff by horizontal bands between two PNG screenshots.
// Usage: `npm run parity:diff -- a.png b.png [--band 400] [--threshold 3] [--out diff.png]`
// Exits with code 1 when any band exceeds the threshold (percentage of differing pixels).
import { readFileSync, writeFileSync } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { isMain, option } from './common.mjs';

export const BAND_HEIGHT = 400;
export const THRESHOLD_PERCENT = 3;
const PIXELMATCH_THRESHOLD = 0.1; // anti-aliasing is ignored (pixelmatch default)

/** Copies `png` onto a transparent canvas of the given size, so unequal pages compare as "different" where they do not overlap. */
/**
 * @param {PNG} png
 * @param {number} width
 * @param {number} height
 * @returns {PNG}
 */
function padTo(png, width, height) {
  const canvas = new PNG({ width, height });
  PNG.bitblt(png, canvas, 0, 0, Math.min(png.width, width), Math.min(png.height, height), 0, 0);
  return canvas;
}

/**
 * @param {Buffer} bufferA
 * @param {Buffer} bufferB
 * @param {{bandHeight?: number, threshold?: number}} [options]
 * @returns {{width: number, height: number, bands: {index: number, y: number, height: number, percent: number}[], failed: boolean, diffPng: Buffer}}
 */
export function diffBands(bufferA, bufferB, { bandHeight = BAND_HEIGHT, threshold = THRESHOLD_PERCENT } = {}) {
  const a = PNG.sync.read(bufferA);
  const b = PNG.sync.read(bufferB);
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const imageA = padTo(a, width, height);
  const imageB = padTo(b, width, height);
  const diff = new PNG({ width, height });

  const bands = [];
  for (let y = 0, index = 0; y < height; y += bandHeight, index += 1) {
    const h = Math.min(bandHeight, height - y);
    const start = y * width * 4;
    const end = start + h * width * 4;
    const count = pixelmatch(
      imageA.data.subarray(start, end),
      imageB.data.subarray(start, end),
      diff.data.subarray(start, end),
      width,
      h,
      { threshold: PIXELMATCH_THRESHOLD },
    );
    bands.push({ index, y, height: h, percent: (count / (width * h)) * 100 });
  }
  return {
    width,
    height,
    bands,
    failed: bands.some((band) => band.percent > threshold),
    diffPng: PNG.sync.write(diff),
  };
}

if (isMain(import.meta.url)) {
  const [fileA, fileB] = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!fileA || !fileB) {
    process.stderr.write('usage: diff.mjs <a.png> <b.png> [--band 400] [--threshold 3] [--out diff.png]\n');
    process.exit(2);
  }
  const result = diffBands(readFileSync(fileA), readFileSync(fileB), {
    bandHeight: Number(option('band', String(BAND_HEIGHT))),
    threshold: Number(option('threshold', String(THRESHOLD_PERCENT))),
  });
  const out = option('out', undefined);
  if (out) writeFileSync(out, result.diffPng);
  process.stdout.write(
    `${JSON.stringify({ width: result.width, height: result.height, failed: result.failed, bands: result.bands }, null, 2)}\n`,
  );
  process.exit(result.failed ? 1 : 0);
}
