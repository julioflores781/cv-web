import type { Lang } from '@/lib/i18n/config';
import { getContent, resetContentMemo, type ContentOptions } from './content';
import { ResumeFetchError, ResumeUnavailableError } from './errors';
import type { Resource } from './request';
import type { Resume, ResumeResult } from './types';
import { parseResume } from './validate';

export type GetResumeOptions = ContentOptions;

export const RESUME: Resource<Resume> = {
  name: 'Resume',
  file: 'resume',
  path: '/api/v1/resume',
  parse: parseResume,
  mismatch: (resume, lang) =>
    resume.language === lang ? null : `language mismatch: asked for "${lang}" but the API answered "${resume.language}"`,
  fail: (lang, message, details) => new ResumeFetchError(lang, message, details),
  unavailable: (lang, cause, file) => new ResumeUnavailableError(lang, cause, file),
};

const projected = new WeakMap<object, ResumeResult>();

/** Single entry point for resume data: API first, saved copy second, otherwise throws. Memoized per language. */
export async function getResume(lang: Lang, options: GetResumeOptions = {}): Promise<ResumeResult> {
  const content = await getContent(RESUME, lang, options);
  let result = projected.get(content);
  if (!result) {
    result = { resume: content.data, source: content.source };
    projected.set(content, result);
  }
  return result;
}

/** Test helper: forgets memoized results. */
export const resetResumeMemo = resetContentMemo;
