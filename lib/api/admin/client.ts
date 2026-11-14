import { logEvent } from '@/lib/log';
import { newRequestId } from '@/lib/request-id';
import { validIp } from '../client-ip';
import { getConfig } from '../config';
import { httpRequest, type HttpResponse } from '../request';
import { parseProblemBody, parseRetryAfter } from './parse';
import type { AdminCallContext, AdminResult } from './types';

export const READ_TIMEOUT_MS = 4_000;
export const WRITE_TIMEOUT_MS = 10_000;
export const UPLOAD_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 500;
const REQUEST_ID = /^[0-9a-f]{32}$/;

export interface AdminRequest<T> extends AdminCallContext {
  /** Short stable label for logs (`content.save`); never a path with ids. */
  operation: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path under the API base, already validated by the caller (`/api/v1/admin/content/services`). */
  path: string;
  query?: Record<string, string | number | boolean> | undefined;
  /** JSON body; mutually exclusive with `binary`. */
  json?: unknown;
  binary?: { bytes: Uint8Array; contentType: string } | undefined;
  /** Validates the body of a success answer; `null` means it does not match the contract. */
  parse: (raw: unknown) => T | null;
  /** Statuses that count as success (default `[200]`); an empty body is only accepted for 204. */
  success?: readonly number[] | undefined;
}

/**
 * The only way the web talks to `/api/v1/admin`. The headers are a closed list built here, never copied from the browser:
 * `Authorization`, `Accept`, `X-Request-Id`, `X-Client-IP` (only a valid address) and `Content-Type` (only with a body).
 * Cookies, `CF-*`, `X-Forwarded-*`, `Referer`, `Origin` and `User-Agent` cannot get through because nothing here reads them.
 * Reads get one retry on a transport error or a 5xx; writes are never retried (a retry could repeat an effect).
 * It never throws and no result carries the URL, host, response body or cause of a failure.
 */
export async function adminRequest<T>(init: AdminRequest<T>): Promise<AdminResult<T>> {
  const requestId = init.requestId !== undefined && REQUEST_ID.test(init.requestId) ? init.requestId : newRequestId();
  const isRead = init.method === 'GET';
  const timeoutMs = init.timeoutMs ?? (isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const retryDelayMs = init.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const attempts = isRead ? 2 : 1;

  let last: AdminResult<T> = { kind: 'unreachable', requestId };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const started = performance.now();
    last = await attemptOnce(init, requestId, timeoutMs);
    if (last.kind !== 'ok') {
      logEvent('warn', 'admin_api_call', {
        request_id: requestId,
        operation: init.operation,
        outcome: last.kind === 'problem' ? 'http_error' : last.kind,
        status: last.kind === 'problem' ? last.status : undefined,
        attempt,
        duration_ms: Math.round(performance.now() - started),
      });
    }
    if (!isRetryable(last) || attempt === attempts) break;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return last;
}

const isRetryable = <T>(result: AdminResult<T>): boolean =>
  result.kind === 'unreachable' || result.kind === 'timeout' || (result.kind === 'problem' && result.status >= 500);

function buildHeaders<T>(init: AdminRequest<T>, requestId: string): Record<string, string> {
  const ip = validIp(init.clientIp);
  const body = init.binary !== undefined || init.json !== undefined;
  return {
    Accept: 'application/json',
    'X-Request-Id': requestId,
    ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    ...(ip ? { 'X-Client-IP': ip } : {}),
    ...(body ? { 'Content-Type': init.binary?.contentType ?? 'application/json' } : {}),
  };
}

function buildUrl<T>(init: AdminRequest<T>): string {
  const base = (init.baseUrl ?? getConfig().apiUrl).replace(/\/+$/, '');
  const query = init.query ? new URLSearchParams(Object.entries(init.query).map(([key, value]) => [key, String(value)])).toString() : '';
  return `${base}${init.path}${query ? `?${query}` : ''}`;
}

async function attemptOnce<T>(init: AdminRequest<T>, requestId: string, timeoutMs: number): Promise<AdminResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
  let response: HttpResponse;
  try {
    const body = init.binary?.bytes ?? (init.json === undefined ? undefined : JSON.stringify(init.json));
    response = await httpRequest(buildUrl(init), { method: init.method, headers: buildHeaders(init, requestId), signal, ...(body === undefined ? {} : { body }) });
  } catch {
    // The error is dropped: the message of a transport error carries the host and port of the API.
    return controller.signal.aborted ? { kind: 'timeout', requestId } : { kind: 'unreachable', requestId };
  } finally {
    clearTimeout(timer);
  }
  return interpret(init, response, requestId);
}

function interpret<T>(init: AdminRequest<T>, response: HttpResponse, requestId: string): AdminResult<T> {
  const { status, body, headers } = response;
  if (!(init.success ?? [200]).includes(status)) return toProblem(response, requestId);

  let raw: unknown;
  if (body.trim() === '') {
    // An empty body is only a valid success for 204; for any other status the API broke its contract.
    if (status !== 204) return { kind: 'invalid', source: 'response', requestId };
  } else {
    try {
      raw = JSON.parse(body);
    } catch {
      // The parse error is dropped: its message quotes a piece of the body.
      return { kind: 'invalid', source: 'response', requestId };
    }
  }
  const data = init.parse(raw);
  return data === null ? { kind: 'invalid', source: 'response', requestId } : { kind: 'ok', status, data, headers, requestId };
}

function toProblem<T>({ status, body, headers }: HttpResponse, requestId: string): AdminResult<T> {
  let parsed: ReturnType<typeof parseProblemBody> = null;
  try {
    parsed = parseProblemBody(JSON.parse(body));
  } catch {
    // Not JSON: the status alone describes the failure.
  }
  const retryAfterSeconds = parseRetryAfter(headers['retry-after']);
  return {
    kind: 'problem',
    status,
    code: parsed?.code ?? `HTTP_${status}`,
    title: parsed?.title ?? '',
    ...(parsed?.errors === undefined ? {} : { errors: parsed.errors }),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    requestId,
  };
}
