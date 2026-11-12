// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, inject, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

describe('next build (no API at build time)', () => {
  const build = inject('build');

  it('T25: builds with exit 0, the API receives 0 requests and server.js exists', () => {
    expect(build.code, build.output).toBe(0);
    expect(build.apiRequests).toEqual([]);
    expect(existsSync(path.join(root, '.next', 'standalone', 'server.js'))).toBe(true);
    expect(existsSync(path.join(build.standaloneDir, 'server.js'))).toBe(true);
  });

  it('T26: the pages are dynamic and no prerendered .html contains «Ada»', () => {
    expect(build.output).toMatch(/ƒ \/\[\[\.\.\.slug\]\]/);
    expect(build.output).not.toMatch(/[○●] \/\[\[\.\.\.slug\]\]/);
    const appDir = path.join(root, '.next', 'server', 'app');
    const prerendered = listFiles(appDir).filter((file) => file.endsWith('.html'));
    expect(prerendered.filter((file) => readFileSync(file, 'utf8').includes('Ada'))).toEqual([]);
  });
});
