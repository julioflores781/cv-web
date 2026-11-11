import type { Lang } from '@/lib/i18n/config';

/** Human-readable reason for an unknown thrown value. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // `node:http` reports a refused connection as an AggregateError (one per address tried) with an empty message.
  if (error.message === '' && 'code' in error && typeof error.code === 'string') return error.code;
  if (error.message === '' && error instanceof AggregateError) return describeError(error.errors[0]);
  return error.message || error.name;
}

interface FetchErrorDetails {
  status?: number;
  code?: string;
  retryable?: boolean;
  cause?: unknown;
}

/** The API did not return usable content for a resource (transport, HTTP, JSON, shape or language problem). */
export class ApiFetchError extends Error {
  readonly resource: string;
  readonly lang: Lang;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly retryable: boolean;

  constructor(resource: string, lang: Lang, message: string, details: FetchErrorDetails = {}) {
    super(`${resource} (${lang}): ${message}`, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'ApiFetchError';
    this.resource = resource;
    this.lang = lang;
    this.status = details.status;
    this.code = details.code;
    this.retryable = details.retryable ?? false;
  }
}

/** The API did not return a usable resume. */
export class ResumeFetchError extends ApiFetchError {
  constructor(lang: Lang, message: string, details: FetchErrorDetails = {}) {
    super('Resume', lang, message, details);
    this.name = 'ResumeFetchError';
  }
}

/** Neither the API nor the saved fallback copy could provide a resource: the build must fail. */
export class ContentUnavailableError extends Error {
  readonly resource: string;
  readonly lang: Lang;

  constructor(resource: string, lang: Lang, cause: string, cacheFile: string) {
    super(
      `${resource} (${lang}) unavailable: the API failed (${cause}) and there is no valid saved copy at ${cacheFile}. ` +
        'Refusing to publish a site without data.',
    );
    this.name = 'ContentUnavailableError';
    this.resource = resource;
    this.lang = lang;
  }
}

/** Neither the API nor the saved fallback copy could provide a resume: the build must fail. */
export class ResumeUnavailableError extends ContentUnavailableError {
  constructor(lang: Lang, cause: string, cacheFile: string) {
    super('Resume', lang, cause, cacheFile);
    this.name = 'ResumeUnavailableError';
  }
}
