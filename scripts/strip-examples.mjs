// Removes the OpenAPI `@example` blocks from the generated schema: they carry real CV data
// and the repo must not contain it. Used by `scripts/generate-api.mjs` (and runnable on its own).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TAG_LINE = /^\s*\*\s*@\w+/;
const COMMENT_END = /^\s*\*\//;

/**
 * Drops every `@example` tag with its continuation lines (a multi-line example runs until the next tag
 * or the end of the comment). A one-line `/** @example x *\/` comment is dropped whole.
 * @param {string} source
 * @returns {string}
 */
export function stripExamples(source) {
  const out = [];
  let skipping = false;
  for (const line of source.split('\n')) {
    if (skipping) {
      if (!/@example\b/.test(line) && (TAG_LINE.test(line) || COMMENT_END.test(line))) skipping = false;
      else if (!/@example\b/.test(line)) continue;
    }
    if (/^\s*\/\*\*\s*@example\b.*\*\/\s*$/.test(line)) continue;
    if (/^\s*\*\s*@example\b/.test(line)) {
      skipping = true;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2] ?? 'lib/api/schema.d.ts';
  writeFileSync(target, stripExamples(readFileSync(target, 'utf8')));
}
