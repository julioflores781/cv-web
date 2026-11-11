// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PUBLIC_SOURCE, resolveSource } from './generate-api.mjs';
import { stripExamples } from './strip-examples.mjs';

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'generate-api.mjs');
const fixture = (name: string) => path.join(root, 'tests', 'fixtures', name);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'cv-web-genapi-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[], env: Record<string, string> = {}) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (!('OPENAPI_SOURCE' in env)) delete childEnv.OPENAPI_SOURCE;
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: childEnv });
}

describe('generate-api', () => {
  it('HX-T2: one-line and multi-line @example blocks are gone from the generated schema, with their continuation lines', () => {
    const target = path.join(dir, 'schema.d.ts');
    const result = run([fixture('openapi-mini.json'), '--out', target]);
    expect(result.status, result.stderr).toBe(0);
    const schema = readFileSync(target, 'utf8');
    expect(schema).not.toMatch(/@example/);
    for (const leftover of ['SENTINEL-ONE-LINE', 'SENTINEL-MULTI-X', 'SENTINEL-MULTI-Y']) expect(schema).not.toContain(leftover);
    // The tags around the examples survive.
    expect(schema).toContain('@description Single line example');
    expect(schema).toContain('@description After the examples');
  });

  it('HX-T2: stripExamples keeps neighbouring tags and drops a one-line example comment', () => {
    const input = ['/**', ' * @example {', ' *   "a": 1', ' * }', ' * @description kept', ' */', '/** @example x */', 'a: string;'].join('\n');
    expect(stripExamples(input)).toBe(['/**', ' * @description kept', ' */', 'a: string;'].join('\n'));
  });

  it('HX-T3: a document without /architecture fails naming the path and leaves schema.d.ts untouched', () => {
    const target = path.join(dir, 'schema.d.ts');
    writeFileSync(target, 'untouched');
    const result = run([fixture('openapi-mini-incomplete.json'), '--out', target]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('/api/v1/architecture');
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  });

  it('HX-T3: an unreadable source also leaves the file untouched', () => {
    const target = path.join(dir, 'schema.d.ts');
    copyFileSync(fixture('openapi-mini.json'), path.join(dir, 'copy.json'));
    writeFileSync(target, 'untouched');
    expect(run([path.join(dir, 'missing.json'), '--out', target]).status).not.toBe(0);
    expect(readFileSync(target, 'utf8')).toBe('untouched');
  });

  it('HX-T4: --dry-run resolves CLI argument over OPENAPI_SOURCE over the public API', () => {
    expect(run(['--dry-run', 'cli.json'], { OPENAPI_SOURCE: 'env.json' }).stdout).toContain('source: cli.json');
    expect(run(['--dry-run'], { OPENAPI_SOURCE: 'env.json' }).stdout).toContain('source: env.json');
    expect(run(['--dry-run']).stdout).toContain(`source: ${PUBLIC_SOURCE}`);
    expect(resolveSource(undefined, {})).toBe('https://cv-api.floreslab.dev/openapi.json');
  });
});
