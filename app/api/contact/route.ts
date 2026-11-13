import { forwardContact, type ContactPayload } from '@/lib/api/contact';
import { validateContact } from '@/lib/contact/validate';
import type { Lang } from '@/lib/i18n/config';
import { logEvent, type LogFields, type LogLevel } from '@/lib/log';
import type { ProblemInfo } from '@/lib/problem';
import { newRequestId } from '@/lib/request-id';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;
const HEADERS = { 'Cache-Control': 'no-store' };
const FIELDS = ['name', 'email', 'message'] as const;

function problem(status: number, code: string, title: string, detail: string): Response {
  const body: ProblemInfo = { title, detail, status, code };
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/problem+json' } });
}

/** Reads the body as text, giving up as soon as it goes over the limit (the declared length is not trusted). */
async function readLimited(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

function parsePayload(raw: string): ContactPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const { name, email, message, website = '' } = json as Record<string, unknown>;
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string' || typeof website !== 'string') return null;
  return { name: name.trim(), email: email.trim(), message: message.trim(), website };
}

function langOf(request: Request): Lang {
  const lang = new URL(request.url).searchParams.get('lang');
  return lang === 'en' ? 'en' : 'es';
}

/** Contact form entry point: validates the message and forwards it to the API from the server (the browser only talks to this origin). */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const started = performance.now();
  /**
   * Stamps the id on the response and writes the single `contact` line. It holds the outcome, the status and a problem code or the NAME of an
   * invalid field: never the values of the form, the visitor IP nor headers.
   */
  const finish = (response: Response, outcome: string, level: LogLevel, extra: LogFields = {}): Response => {
    response.headers.set('X-Request-Id', requestId);
    logEvent(level, 'contact', { request_id: requestId, outcome, status: response.status, ...extra, duration_ms: Math.round(performance.now() - started) });
    return response;
  };
  const invalid = (status: number, code: string, title: string, detail: string, reason: string): Response =>
    finish(problem(status, code, title, detail), 'invalid', 'info', { code, reason });

  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return invalid(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', 'Content-Type must be application/json.', 'content_type');
  }
  const tooLarge = () => invalid(413, 'PAYLOAD_TOO_LARGE', 'Payload too large', `The body must not exceed ${MAX_BODY_BYTES} bytes.`, 'too_large');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return tooLarge();
  const raw = await readLimited(request);
  if (raw === null) return tooLarge();

  const payload = parsePayload(raw);
  if (payload === null) {
    return invalid(400, 'BAD_REQUEST', 'Bad request', 'The body must be a JSON object with string fields name, email and message.', 'malformed_body');
  }
  const lang = langOf(request);
  const errors = validateContact(payload);
  const badField = FIELDS.find((field) => errors[field]);
  if (badField) {
    const detail = lang === 'en' ? `The "${badField}" field is not valid.` : `El campo «${badField}» no es válido.`;
    return invalid(400, 'CONTACT_INVALID', lang === 'en' ? 'Invalid message' : 'Mensaje no válido', detail, badField);
  }

  const result = await forwardContact({ lang, payload, clientIp: request.headers.get('cf-connecting-ip'), requestId });
  switch (result.kind) {
    case 'sent':
      return finish(new Response(null, { status: 201, headers: HEADERS }), 'sent', 'info');
    case 'rejected':
      return finish(problem(result.status, result.problem.code, result.problem.title, result.problem.detail), 'rejected', 'info', { code: result.problem.code });
    case 'timeout':
      return finish(problem(504, 'CONTACT_TIMEOUT', 'Gateway timeout', 'The message service did not answer in time.'), 'timeout', 'warn');
    default:
      return finish(problem(502, 'CONTACT_UPSTREAM', 'Bad gateway', 'The message service is unavailable.'), result.kind.replace('-', '_'), 'warn');
  }
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
