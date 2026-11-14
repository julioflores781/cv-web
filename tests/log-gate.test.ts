// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { usesConsole } from './helpers/console-scan';

const root = path.resolve(__dirname, '..');
const LOG_FILE = path.join('lib', 'log.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Production code of `lib`, `app`, `components` and the root `instrumentation.ts`, as paths relative to the repo. */
const production = [...['lib', 'app', 'components'].flatMap((dir) => sourceFiles(path.join(root, dir))), path.join(root, 'instrumentation.ts')].map((file) =>
  path.relative(root, file),
);

describe('log gate', () => {
  it('W21: no console. outside lib/log.ts in lib, app, components and instrumentation.ts', () => {
    const offenders = production.filter((file) => file !== LOG_FILE && usesConsole(readFileSync(path.join(root, file), 'utf8')));
    expect(offenders).toEqual([]);
    expect(production).toContain(LOG_FILE);
    expect(readFileSync(path.join(root, LOG_FILE), 'utf8')).toMatch(/\bconsole\./);
  });

  it('W21 extra: the scanner matches console members and ignores look-alikes', () => {
    expect(usesConsole('console.warn(x)')).toBe(true);
    expect(usesConsole('  console . error(x)')).toBe(true);
    expect(usesConsole('window.console.info(x)')).toBe(true);
    expect(usesConsole('const consoleLike = 1; reconsole.x')).toBe(false);
    expect(usesConsole('logEvent("warn", "x")')).toBe(false);
  });
});
