import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(__dirname, '..', '..');

export const readText = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');

/** Every `.css` file under `dir` (relative to the repo root), skipping dot folders and node_modules. */
export function cssFiles(dir = '.'): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'out' ? [] : cssFiles(rel);
    return entry.name.endsWith('.css') ? [rel] : [];
  });
}

export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

export interface Rule {
  selector: string;
  body: string;
}

/** Flat `selector { body }` rules (also the ones inside `@media`); nested at-rules are not kept as rules. */
export function rules(css: string): Rule[] {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: (match[1] as string).trim(),
    body: match[2] as string,
  }));
}

export function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--?[\w-]+)\s*:\s*([^;]+);?/g)) out[match[1] as string] = (match[2] as string).trim();
  return out;
}

/** Merged declarations of every rule whose selector list contains `selector` (e.g. `:root`). */
export function tokensOf(css: string, selector: string): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const rule of rules(css)) {
    if (rule.selector.split(',').some((part) => part.trim() === selector)) Object.assign(merged, declarations(rule.body));
  }
  return merged;
}

/** The css without the token blocks (rules that define custom properties), where colours must not appear. */
export function withoutTokenBlocks(css: string): string {
  return stripComments(css).replace(/[^{}]+\{[^{}]*--[\w-]+\s*:[^{}]*\}/g, '');
}

/** Relative luminance of `#RRGGBB`. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] as number) + 0.7152 * (channels[1] as number) + 0.0722 * (channels[2] as number);
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
