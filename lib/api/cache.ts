import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Lang } from '@/lib/i18n/config';
import type { Resume } from './types';
import { parseResume } from './validate';

/** `<dir>/<name>-<lang>.json`; the resume keeps `resume-<lang>.json`. */
export function cachePath(dir: string, name: string, lang: Lang): string {
  return path.join(dir, `${name}-${lang}.json`);
}

/** Atomic write (temp file + rename) so an interrupted build never leaves a half-written fallback. */
export async function writeJson(dir: string, name: string, lang: Lang, value: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  const target = cachePath(dir, name, lang);
  // Unique per call: two concurrent writes of the same file (same pid, same millisecond) used to share a temp
  // name, so the second rename failed with ENOENT and the build fell back to the saved copy.
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value), 'utf8');
  await rename(temp, target);
}

/** Returns the saved copy only if it exists, parses and `validate` accepts it (`null` otherwise). */
export async function readJson<T>(
  dir: string,
  name: string,
  lang: Lang,
  validate: (raw: unknown) => T | null,
): Promise<T | null> {
  try {
    return validate(JSON.parse(await readFile(cachePath(dir, name, lang), 'utf8')));
  } catch {
    return null;
  }
}

export function cacheFile(dir: string, lang: Lang): string {
  return cachePath(dir, 'resume', lang);
}

export function writeCache(dir: string, lang: Lang, resume: Resume): Promise<void> {
  return writeJson(dir, 'resume', lang, resume);
}

/** The saved resume, only if it is valid for this language. */
export function readCache(dir: string, lang: Lang): Promise<Resume | null> {
  return readJson(dir, 'resume', lang, (raw) => {
    const parsed = parseResume(raw);
    return parsed !== null && parsed.language === lang ? parsed : null;
  });
}
