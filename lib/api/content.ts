import { cache } from 'react';
import type { Lang } from '@/lib/i18n/config';
import { describeError } from './errors';
import { requestJson, type RequestOptions, type Resource } from './request';

async function read<T>(resource: Resource<T>, lang: Lang, options?: RequestOptions): Promise<T> {
  try {
    return await requestJson(resource, lang, options);
  } catch (error) {
    // The page then answers 500; the reason (never shown to the visitor) goes to the server log.
    console.error(`[cv-web] ${resource.name} (${lang}) unavailable: ${describeError(error)}`);
    throw error;
  }
}

/**
 * One API read per (resource, language, options) inside a single React render (`generateMetadata` and `Page` share it).
 * There is no cache between requests: every render reads the API again, and any failure throws.
 */
export const getContent = cache(read);
