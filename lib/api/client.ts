import type { Lang } from '@/lib/i18n/config';
import { RESUME } from './get-resume';
import { requestJson, type RequestOptions } from './request';
import type { Resume } from './types';

export type FetchResumeOptions = RequestOptions;

/** Fetches and validates the resume. Retries only transport errors and 5xx answers. */
export function fetchResume(lang: Lang, options: FetchResumeOptions = {}): Promise<Resume> {
  return requestJson(RESUME, lang, options);
}
