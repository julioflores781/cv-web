import http from 'node:http';
import https from 'node:https';
import type { Lang } from '@/lib/i18n/config';
import { parseProblem } from '@/lib/problem';
import { getConfig } from './config';
import { ApiFetchError, describeError } from './errors';

export interface RequestOptions {
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/** One API resource: where it lives and how to validate it. */
export interface Resource<T> {
  /** Label used in errors and warnings, e.g. `Architecture`. */
  name: string;
  /** Path under the API base, e.g. `/api/v1/architecture`. */
  path: string;
  /** Validates an untrusted payload; `null` when it is not valid. */
  parse: (raw: unknown) => T | null;
  /** Extra check that the payload belongs to `lang`; returns the reason when it does not. */
  mismatch?: (value: T, lang: Lang) => string | null;
  /** Error type for failures of this resource (defaults to `ApiFetchError`). */
  fail?: (lang: Lang, message: string, details: ErrorDetails) => ApiFetchError;
}

type ErrorDetails = ConstructorParameters<typeof ApiFetchError>[3];

export const DEFAULT_TIMEOUT_MS = 4_000;
export const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 500;

function readProblemCode(body: string): string | undefined {
  try {
    return parseProblem(JSON.parse(body))?.code;
  } catch {
    // Not a problem+json body: the HTTP status alone describes the failure.
    return undefined;
  }
}

export interface HttpRequestInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

/**
 * Plain `node:http(s)` instead of `fetch`: Next.js patches `fetch` and may keep responses in its data cache. This
 * transport is never cached, so every render sees what the API answers right now. Sends exactly the given headers
 * (plus the ones Node itself needs: Host, Connection and Content-Length).
 */
export function httpRequest(url: string, { method = 'GET', headers, body, signal }: HttpRequestInit): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const send = url.startsWith('https:') ? https.request : http.request;
    const request = send(url, { method, signal, ...(headers ? { headers } : {}) }, (response) => {
      response.setEncoding('utf8');
      let text = '';
      response.on('data', (chunk: string) => (text += chunk));
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: text }));
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(body);
  });
}

const httpGet = (url: string, signal: AbortSignal) => httpRequest(url, { headers: { Accept: 'application/json' }, signal });

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
