import { isIP } from 'node:net';
import type { Lang } from '@/lib/i18n/config';
import { parseProblem, type ProblemInfo } from '@/lib/problem';
import { getConfig } from './config';
import { httpRequest } from './request';

export const CONTACT_TIMEOUT_MS = 10_000;
const IP_MAX_LENGTH = 45;

export interface ContactPayload {
  name: string;
  email: string;
  message: string;
  /** Honeypot: a person leaves it empty; it is forwarded as is for the API to judge. */
  website: string;
}

export interface ForwardOptions {
  lang: Lang;
  payload: ContactPayload;
  /** Raw `CF-Connecting-IP` of the visitor; forwarded only when it is a valid IP address. */
  clientIp?: string | null | undefined;
  baseUrl?: string;
  timeoutMs?: number;
}

/** What the API answered; it never throws and never leaves the reason of a failure in the result. */
export type ForwardResult =
  | { kind: 'sent' }
  /** The API refused the message (400 or 429) with its own problem. */
  | { kind: 'rejected'; status: 400 | 429; problem: ProblemInfo }
  | { kind: 'upstream-error' }
  | { kind: 'timeout' }
  | { kind: 'unreachable' };

function validIp(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  return value && value.length <= IP_MAX_LENGTH && isIP(value) !== 0 ? value : undefined;
}

function readProblem(body: string): ProblemInfo | null {
  try {
    return parseProblem(JSON.parse(body));
  } catch {
    return null;
  }
}

/**
 * Forwards a validated contact message to `POST /api/v1/contact/messages?lang=`. The only headers are `Content-Type` and, when valid,
 * `CF-Connecting-IP` (the API rate-limits per sender); cookies, User-Agent, Referer, X-Forwarded-For and Authorization are never passed on.
 * One attempt, no retry: a retry could deliver the same message twice.
 */
export async function forwardContact({ lang, payload, clientIp, baseUrl, timeoutMs = CONTACT_TIMEOUT_MS }: ForwardOptions): Promise<ForwardResult> {
  const url = `${(baseUrl ?? getConfig().apiUrl).replace(/\/+$/, '')}/api/v1/contact/messages?lang=${lang}`;
  const ip = validIp(clientIp);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(ip ? { 'CF-Connecting-IP': ip } : {}) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { status, body } = await httpRequest(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    if (status === 201) return { kind: 'sent' };
    if (status === 400 || status === 429) {
      const problem = readProblem(body);
      if (problem) return { kind: 'rejected', status, problem };
    }
    return { kind: 'upstream-error' };
  } catch {
    return { kind: controller.signal.aborted ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
