const DEFAULT_TIMEOUT_MS = 15_000;

export type BrowserResult<T> =
  | { kind: 'ok'; status: number; data: T }
  /** The session is dead: the caller goes to the login. */
  | { kind: 'expired' }
  /** `errors` (a 422) and `latest` (a 409 of a save) travel as received, only when the answer has them; the caller checks their shape. */
  | { kind: 'problem'; status: number; code: string; requestId?: string; retryAfterSeconds?: number; errors?: unknown; latest?: unknown }
  | { kind: 'network' }
  | { kind: 'offline' }
  | { kind: 'timeout' };

/** What a cancellable call (an upload) gives: the usual results, or `aborted` when the caller cancelled it. */
export type AbortableResult<T> = BrowserResult<T> | { kind: 'aborted' };

export interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  json?: unknown;
  /** A multipart body; the browser sets its `Content-Type` (with the boundary). */
  form?: FormData;
  timeoutMs?: number;
}

/** `/admin/api/x?a=1` -> `/admin/api/x/?a=1`: `trailingSlash: true` would answer a POST without the slash with a 308. */
function withSlash(path: string): string {
  const [pathname = '', query] = path.split('?');
  return `${pathname.endsWith('/') ? pathname : `${pathname}/`}${query === undefined ? '' : `?${query}`}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function problemOf(status: number, body: unknown): BrowserResult<never> {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const code = typeof record.code === 'string' ? record.code : `HTTP_${status}`;
  if (status === 401 && code === 'ADMIN_UNAUTHORIZED') return { kind: 'expired' };
  return {
    kind: 'problem',
    status,
    code,
    ...(typeof record.requestId === 'string' ? { requestId: record.requestId } : {}),
    ...(typeof record.retryAfterSeconds === 'number' ? { retryAfterSeconds: record.retryAfterSeconds } : {}),
    ...(record.errors === undefined ? {} : { errors: record.errors }),
    ...(record.latest === undefined ? {} : { latest: record.latest }),
  };
}

/**
 * The only `fetch` of the panel's pages: a relative call to this site's own `/admin/api/*` handlers (the browser never talks to the CV API).
 * It never throws. A 401 `ADMIN_UNAUTHORIZED` is `expired`; transport failures are told apart as `offline`, `timeout` and `network`.
 */
export function adminFetch<T = unknown>(path: string, options: FetchOptions = {}): Promise<BrowserResult<T>> {
  // Without a signal the call cannot be aborted, so the result is never `aborted`.
  return send<T>(path, options) as Promise<BrowserResult<T>>;
}

async function send<T>(path: string, { method = 'POST', json, form, timeoutMs = DEFAULT_TIMEOUT_MS }: FetchOptions, signal?: AbortSignal): Promise<AbortableResult<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(withSlash(path), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      ...(form !== undefined ? { body: form } : json === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(json) }),
    });
    const text = await response.text();
    const body = text === '' ? undefined : parseJson(text);
    if (response.ok) {
      return body === undefined && text !== '' ? { kind: 'problem', status: response.status, code: 'ADMIN_BAD_RESPONSE' } : { kind: 'ok', status: response.status, data: body as T };
    }
    return problemOf(response.status, body);
  } catch {
    if (timedOut) return { kind: 'timeout' };
    if (signal?.aborted) return { kind: 'aborted' };
    return typeof navigator !== 'undefined' && navigator.onLine === false ? { kind: 'offline' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** An upload waits longer than other calls: the handler gives the API 30 s on its own. */
const UPLOAD_TIMEOUT_MS = 45_000;

/**
 * Sends one image to `POST /admin/api/images/` as `FormData` with a single `file` part. The browser frames the multipart (no `Content-Type` is
 * forced); uploads are never retried, and `signal` cancels one.
 */
export function uploadImage<T = unknown>(file: Blob, { signal }: { signal?: AbortSignal } = {}): Promise<AbortableResult<T>> {
  const form = new FormData();
  form.append('file', file);
  return send<T>('/admin/api/images/', { method: 'POST', form, timeoutMs: UPLOAD_TIMEOUT_MS }, signal);
}
