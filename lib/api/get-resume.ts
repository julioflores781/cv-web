import type { Lang } from '@/lib/i18n/config';
import { ResumeFetchError } from './errors';
import { getContent } from './content';
import type { RequestOptions, Resource } from './request';
import type { Resume } from './types';
import { parseResume } from './validate';

export const RESUME: Resource<Resume> = {
  name: 'Resume',
  path: '/api/v1/resume',
  parse: parseResume,
  mismatch: (resume, lang) =>
    resume.language === lang ? null : `language mismatch: asked for "${lang}" but the API answered "${resume.language}"`,
  fail: (lang, message, details) => new ResumeFetchError(lang, message, details),
};

/** Single entry point for resume data: read from the API on every render, throws if it is unusable. */
export async function getResume(lang: Lang, options?: RequestOptions): Promise<{ resume: Resume }> {
  return { resume: await getContent(RESUME, lang, options) };
}
