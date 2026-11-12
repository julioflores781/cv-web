import { parseProblem } from '@/lib/problem';
import type { ContactField, ContactValues, SendResult } from './types';

export interface SendOptions {
  lang: 'es' | 'en';
  values: ContactValues;
  /** Honeypot content (a person leaves it empty). */
  website?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const FIELD = /[«"]([a-z]+)[»"]/;

function fieldOf(detail: string): ContactField | undefined {
  const name = FIELD.exec(detail)?.[1];
  return name === 'name' || name === 'email' || name === 'message' ? name : undefined;
}

function parseBody(text: string): ReturnType<typeof parseProblem> {
  try {
    return parseProblem(JSON.parse(text));
  } catch {
    return null;
  }
}

/** The only `fetch` outside `lib/api`: a relative `POST /api/contact/?lang=` to this site's own origin, with `Content-Type: application/json` as the only header. */
export async function sendContactMessage({ lang, values, website = '', timeoutMs = DEFAULT_TIMEOUT_MS, signal }: SendOptions): Promise<SendResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', onCallerAbort, { once: true });

  try {
    const response = await fetch(`/api/contact/?lang=${lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name.trim(),
        email: values.email.trim(),
        message: values.message.trim(),
        website,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 201) return { kind: 'sent' };
    const problem = response.status >= 200 && response.status < 300 ? null : parseBody(await response.text());
    if (problem === null) return { kind: 'http-error', status: response.status };
    if (response.status === 400 && problem.code === 'CONTACT_INVALID') {
      const field = fieldOf(problem.detail);
      return { kind: 'invalid', ...(field ? { field } : {}), title: problem.title, detail: problem.detail, code: problem.code };
    }
    if (response.status === 429 && problem.code === 'CONTACT_RATE_LIMITED') return { kind: 'rate-limited' };
    return { kind: 'problem', title: problem.title, detail: problem.detail, code: problem.code, status: response.status };
  } catch {
    if (signal?.aborted) return { kind: 'aborted' };
    return timedOut ? { kind: 'timeout' } : { kind: 'network' };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
