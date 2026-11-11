// @ts-check
// Shared helpers of the parity tooling: repo root, CLI options and the "run as script" guard.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Value following `--<name>` in `argv`, or `fallback` when the flag is absent.
 * @template {string | undefined} T
 * @param {string} name
 * @param {T} fallback
 * @param {string[]} [argv]
 * @returns {string | T}
 */
export function option(name, fallback, argv = process.argv) {
  const at = argv.indexOf(`--${name}`);
  return at > -1 ? (argv[at + 1] ?? fallback) : fallback;
}

/**
 * True when the module with `metaUrl` is the entry point of the process.
 * @param {string} metaUrl `import.meta.url` of the caller
 */
export function isMain(metaUrl) {
  const entry = process.argv[1];
  return entry !== undefined && path.resolve(entry) === fileURLToPath(metaUrl);
}
