import type { Lang } from '@/lib/i18n/config';
import { cachePath, readJson, writeJson } from './cache';
import { getConfig } from './config';
import { ContentUnavailableError, describeError } from './errors';
import { requestJson, type RequestOptions, type Resource } from './request';
import type { ContentSource } from './types';

export interface ContentOptions extends RequestOptions {
  cacheDir?: string;
}

export interface ContentResult<T> {
  data: T;
  source: ContentSource;
}

const memo = new Map<string, Promise<ContentResult<unknown>>>();

async function load<T>(resource: Resource<T>, lang: Lang, options: ContentOptions): Promise<ContentResult<T>> {
  const cacheDir = options.cacheDir ?? getConfig().cacheDir;
  let cause: string;
  try {
    const data = await requestJson(resource, lang, options);
    await writeJson(cacheDir, resource.file, lang, data);
    // A valid empty answer is authoritative: the section is omitted, and the empty copy becomes the fallback.
    if (resource.isEmpty?.(data)) {
      console.warn(`[cv-web] ${resource.name} (${lang}): the API returned no content; section omitted.`);
    }
    return { data, source: 'api' };
  } catch (error) {
    cause = describeError(error);
  }

  const saved = await readJson(cacheDir, resource.file, lang, (raw) => {
    const value = resource.parse(raw);
    return value !== null && resource.mismatch?.(value, lang) == null ? value : null;
  });
  if (saved === null) {
    const file = cachePath(cacheDir, resource.file, lang);
    throw resource.unavailable ? resource.unavailable(lang, cause, file) : new ContentUnavailableError(resource.name, lang, cause, file);
  }
  console.warn(`[cv-web] API unavailable for "${lang}" (${cause}); building from the saved fallback copy.`);
  return { data: saved, source: 'cache' };
}

/** API first, saved copy second, otherwise throws. One request per (resource, language). */
export function getContent<T>(resource: Resource<T>, lang: Lang, options: ContentOptions = {}): Promise<ContentResult<T>> {
  const key = `${resource.file}:${lang}`;
  const existing = memo.get(key);
  if (existing) return existing as Promise<ContentResult<T>>;
  const pending = load(resource, lang, options);
  memo.set(key, pending);
  return pending;
}

/** Test helper: forgets memoized results. */
export function resetContentMemo(): void {
  memo.clear();
}
