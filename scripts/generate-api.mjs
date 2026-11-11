// Regenerates `lib/api/schema.d.ts` from the API's OpenAPI document.
// Source: CLI argument > OPENAPI_SOURCE > the public API. It can be a URL or a file.
// The result replaces the schema only after it passes the checks below; otherwise the file is left untouched.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripExamples } from './strip-examples.mjs';

export const PUBLIC_SOURCE = 'https://cv-api.floreslab.dev/openapi.json';
export const REQUIRED_PATHS = [
  '/api/v1/resume',
  '/api/v1/contact/messages',
  '/api/v1/services',
  '/api/v1/projects',
  '/api/v1/architecture',
];
const DEFAULT_TARGET = 'lib/api/schema.d.ts';

/**
 * @param {string | undefined} cliArg
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveSource(cliArg, env = process.env) {
  return cliArg || env.OPENAPI_SOURCE || PUBLIC_SOURCE;
}

/**
 * Paths missing from the generated schema, plus a flag for leftover examples.
 * @param {string} schema
 * @returns {string[]} problems (empty when the schema is acceptable)
 */
export function checkSchema(schema) {
  const problems = REQUIRED_PATHS.filter((p) => !schema.includes(`"${p}": {`)).map((p) => `missing path ${p}`);
  if (/@example\b/.test(schema)) problems.push('an @example is still present');
  return problems;
}

/**
 * @param {string} source
 * @param {string} target
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function generate(source, target) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cv-web-schema-'));
  const temp = path.join(dir, 'schema.d.ts');
  try {
    const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/.bin/openapi-typescript');
    const run = spawnSync(bin, [source, '-o', temp], { encoding: 'utf8' });
    if (run.status !== 0) return { ok: false, problems: [`openapi-typescript failed: ${(run.stderr || run.stdout).trim()}`] };
    const schema = stripExamples(readFileSync(temp, 'utf8'));
    const problems = checkSchema(schema);
    if (problems.length > 0) return { ok: false, problems };
    writeFileSync(temp, schema);
    // The temp dir may be on another device: copy next to the target, then rename atomically.
    const staged = `${target}.${process.pid}.tmp`;
    writeFileSync(staged, schema);
    renameSync(staged, target);
    return { ok: true, problems: [] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outIndex = args.indexOf('--out');
  const target = outIndex >= 0 ? args[outIndex + 1] : DEFAULT_TARGET;
  const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  const source = resolveSource(positional[0]);
  if (dryRun) {
    process.stdout.write(`source: ${source}\n`);
  } else {
    const result = generate(source, target);
    if (!result.ok) {
      console.error(`generate:api failed for ${source}:\n- ${result.problems.join('\n- ')}\n${target} was not modified.`);
      process.exit(1);
    }
    process.stdout.write(`${target} regenerated from ${source}\n`);
  }
}
