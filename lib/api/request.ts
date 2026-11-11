import http from 'node:http';
import https from 'node:https';
import type { Lang } from '@/lib/i18n/config';
import { parseProblem } from '@/lib/problem';
import { getConfig } from './config';
import { ApiFetchError, ContentUnavailableError, describeError } from './errors';

export interface RequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/** One API resource: where it lives, how to validate it and how its fallback copy is named. */
export interface Resource<T> {
  /** Label used in errors and warnings, e.g. `Architecture`. */
  name: string;
  /** Fallback file prefix: `<file>-<lang>.json`. */
  file: string;
  /** Path under the API base, e.g. `/api/v1/architecture`. */
  path: string;
  /** Validates an untrusted payload; `null` when it is not valid. */
  parse: (raw: unknown) => T | null;
  /** Extra check that the payload belongs to `lang`; returns the reason when it does not. */
  mismatch?: (value: T, lang: Lang) => string | null;
  /** A valid but empty payload (the section is then omitted). */
  isEmpty?: (value: T) => boolean;
  /** Error type for failures of this resource (defaults to `ApiFetchError`). */
  fail?: (lang: Lang, message: string, details: ErrorDetails) => ApiFetchError;
  /** Error type when there is no fallback either (defaults to `ContentUnavailableError`). */
  unavailable?: (lang: Lang, cause: string, cacheFile: string) => ContentUnavailableError;
}

type ErrorDetails = ConstructorParameters<typeof ApiFetchError>[3];

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

function readProblemCode(body: string): string | undefined {
  try {
    return parseProblem(JSON.parse(body))?.code;
  } catch {
    // Not a problem+json body: the HTTP status alone describes the failure.
    return undefined;
  }
}

/**
 * GET over `node:http(s)` instead of `fetch`: Next.js patches `fetch` and keeps every response in
 * `.next/cache/fetch-cache` (persisted by Cloudflare Pages), so a rebuild could publish stale content; `cache: 'no-store'`
 * is not an option because it makes the static export fall back to the saved copy. This transport is never cached.
 */
function httpGet(url: string, signal: AbortSignal): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https:') ? https.get : http.get;
    const request = get(url, { signal, headers: { Accept: 'application/json' } }, (response) => {
      response.setEncoding('utf8');
      let body = '';
      response.on('data', (chunk: string) => (body += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

async function attempt<T>(resource: Resource<T>, lang: Lang, url: string, timeoutMs: number): Promise<T> {
  const fail = (message: string, details: ErrorDetails = {}): ApiFetchError =>
    resource.fail ? resource.fail(lang, message, details) : new ApiFetchError(resource.name, lang, message, details);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let status: number;
    let body: string;
    try {
      const response = await httpGet(url, controller.signal);
      status = response.status;
      body = response.body;
    } catch (error) {
      const reason = controller.signal.aborted ? `timed out after ${timeoutMs} ms` : describeError(error);
      throw fail(`request failed (${reason})`, { retryable: true, cause: error });
    }

    if (status !== 200) {
      const code = readProblemCode(body);
      throw fail(`API answered HTTP ${status}${code ? ` (${code})` : ''}`, {
        status,
        retryable: status >= 500,
        ...(code === undefined ? {} : { code }),
      });
    }

    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch (error) {
      throw fail('response is not valid JSON', { status, cause: error });
    }

    const value = resource.parse(json);
    if (value === null) throw fail(`response does not match the expected ${resource.name.toLowerCase()} shape`, { status });
    const mismatch = resource.mismatch?.(value, lang);
    if (mismatch) throw fail(mismatch, { status });
    return value;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches `<base><path>?lang=<lang>` and validates it. Retries only transport errors and 5xx answers (never 4xx). */
export async function requestJson<T>(resource: Resource<T>, lang: Lang, options: RequestOptions = {}): Promise<T> {
  const baseUrl = (options.baseUrl ?? getConfig().apiUrl).replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const url = `${baseUrl}${resource.path}?lang=${lang}`;

  let lastError: ApiFetchError | undefined;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await attempt(resource, lang, url, timeoutMs);
    } catch (error) {
      if (!(error instanceof ApiFetchError)) throw error;
      lastError = error;
      if (!error.retryable || i === retries) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (i + 1)));
    }
  }
  throw lastError ?? new ApiFetchError(resource.name, lang, 'unknown failure');
}
