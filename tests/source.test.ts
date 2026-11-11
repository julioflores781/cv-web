// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'tests'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && entry.name !== 'schema.d.ts' ? [full] : [];
  });
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file) || file.includes(`${path.sep}tests${path.sep}`);
const all = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(root, dir)));
const production = all.filter((file) => !isTest(file));
const rel = (files: string[]) => files.map((file) => path.relative(root, file));

describe('source rules', () => {
  it('CO-T70 (T68 reformulated): fetch( only in lib/api and lib/contact/client.ts; process.env only in lib/api', () => {
    const inApi = (file: string) => file.startsWith(path.join(root, 'lib', 'api') + path.sep);
    const contactClient = path.join(root, 'lib', 'contact', 'client.ts');
    const fetchers = production.filter((file) => /\bfetch\(/.test(readFileSync(file, 'utf8')));
    expect(rel(fetchers.filter((file) => !inApi(file) && file !== contactClient))).toEqual([]);
    expect(fetchers).toContain(contactClient);
    const envReaders = production.filter((file) => /process\.env/.test(readFileSync(file, 'utf8')));
    expect(rel(envReaders.filter((file) => !inApi(file)))).toEqual([]);
  });

  it('CO-T71: lib/contact has no node:*, process.env, console.* nor storage APIs', () => {
    const files = production.filter((file) => file.startsWith(path.join(root, 'lib', 'contact') + path.sep));
    expect(files.length).toBeGreaterThanOrEqual(4);
    const forbidden = /node:|process\.env|\bconsole\.|localStorage|sessionStorage|indexedDB|document\.cookie/;
    expect(rel(files.filter((file) => forbidden.test(readFileSync(file, 'utf8'))))).toEqual([]);
  });

  it("CO-T72: 'use client' files import @/lib/api only as types and never node:*", () => {
    const clients = production.filter((file) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')));
    expect(clients.length).toBeGreaterThanOrEqual(5);
    const offenders = clients.filter((file) => {
      const imports = [...readFileSync(file, 'utf8').matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)];
      return imports.some(([, isType, source]) => (source as string).startsWith('node:') || (!isType && /^@\/lib\/api(\/|$)/.test(source as string)));
    });
    expect(rel(offenders)).toEqual([]);
  });

  it('T69: no debug logging call is left in the source', () => {
    const needle = ['console', 'log'].join('.');
    const offenders = all.filter((file) => readFileSync(file, 'utf8').includes(needle));
    expect(rel(offenders)).toEqual([]);
  });

  it('T70: package.json defines dev, build, test, lint and typecheck', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    for (const script of ['dev', 'build', 'test', 'lint', 'typecheck']) {
      expect(pkg.scripts[script], script).toBeTruthy();
    }
  });
});

describe('not-found page', () => {
  it('T74: has a title, noindex robots and no hard-coded domain', () => {
    const source = readFileSync(path.join(root, 'app/not-found.tsx'), 'utf8');
    expect(source).toMatch(/title:/);
    expect(source).toMatch(/index:\s*false/);
    expect(source).not.toMatch(/floreslab/);
    expect(source).toMatch(/getConfig/);
  });

  it('extra (PA): has no CSS module, which Next.js would preload on every page and make the console warn', () => {
    expect(readFileSync(path.join(root, 'app/not-found.tsx'), 'utf8')).not.toMatch(/\.module\.css/);
  });
});
