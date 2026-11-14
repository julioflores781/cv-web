import type { Lang } from '@/lib/i18n/config';

/**
 * Safe reason for an unknown thrown value: its error code (`ECONNREFUSED`) or its class name, never its message. Transport messages carry
 * the host and port of the API (`connect ECONNREFUSED 10.0.0.2:8080`) and parse errors carry a piece of the body.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  if ('code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code)) return error.code;
  // `node:http` reports a refused connection as an AggregateError (one per address tried) with the code on its first error.
  if (error instanceof AggregateError && error.errors.length > 0) return describeError(error.errors[0]);
  return error.name || 'Error';
}

/** How a read of the API failed, as logged (`api_call` events). */
export type ApiOutcome = 'http_error' | 'timeout' | 'unreachable' | 'invalid_response';

interface FetchErrorDetails {
  outcome?: ApiOutcome;
  status?: number;
  code?: string;
  retryable?: boolean;
}

/** The API did not return usable content for a resource (transport, HTTP, JSON, shape or language problem). */
export class ApiFetchError extends Error {
  readonly resource: string;
  readonly lang: Lang;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly retryable: boolean;
  readonly outcome: ApiOutcome;

  constructor(resource: string, lang: Lang, message: string, details: FetchErrorDetails = {}) {
    // No `cause` on purpose: Next prints it, and it can hold the API host, port or part of a body.
    super(`${resource} (${lang}): ${message}`);
    this.name = 'ApiFetchError';
    this.resource = resource;
    this.lang = lang;
    this.status = details.status;
    this.code = details.code;
    this.retryable = details.retryable ?? false;
    this.outcome = details.outcome ?? 'invalid_response';
  }
}

/** The API did not return a usable resume. */
export class ResumeFetchError extends ApiFetchError {
  constructor(lang: Lang, message: string, details: FetchErrorDetails = {}) {
    super('Resume', lang, message, details);
    this.name = 'ResumeFetchError';
  }
}
