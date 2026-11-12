import { forwardContact, type ContactPayload } from '@/lib/api/contact';
import { validateContact } from '@/lib/contact/validate';
import type { Lang } from '@/lib/i18n/config';
import type { ProblemInfo } from '@/lib/problem';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;
const HEADERS = { 'Cache-Control': 'no-store' };
const FIELDS = ['name', 'email', 'message'] as const;

function problem(status: number, code: string, title: string, detail: string): Response {
  const body: ProblemInfo = { title, detail, status, code };
  return new Response(JSON.stringify(body), { status, headers: { ...HEADERS, 'Content-Type': 'application/problem+json' } });
}

const badRequest = (detail: string) => problem(400, 'BAD_REQUEST', 'Bad request', detail);

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
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return problem(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type', 'Content-Type must be application/json.');
  }
  const tooLarge = () => problem(413, 'PAYLOAD_TOO_LARGE', 'Payload too large', `The body must not exceed ${MAX_BODY_BYTES} bytes.`);
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return tooLarge();
  const raw = await readLimited(request);
  if (raw === null) return tooLarge();

  const payload = parsePayload(raw);
  if (payload === null) return badRequest('The body must be a JSON object with string fields name, email and message.');
  const lang = langOf(request);
  const errors = validateContact(payload);
  const invalid = FIELDS.find((field) => errors[field]);
  if (invalid) {
    const detail = lang === 'en' ? `The "${invalid}" field is not valid.` : `El campo «${invalid}» no es válido.`;
    return problem(400, 'CONTACT_INVALID', lang === 'en' ? 'Invalid message' : 'Mensaje no válido', detail);
  }

  const result = await forwardContact({ lang, payload, clientIp: request.headers.get('cf-connecting-ip') });
  switch (result.kind) {
    case 'sent':
      return new Response(null, { status: 201, headers: HEADERS });
    case 'rejected':
      return problem(result.status, result.problem.code, result.problem.title, result.problem.detail);
    case 'timeout':
      return problem(504, 'CONTACT_TIMEOUT', 'Gateway timeout', 'The message service did not answer in time.');
    default:
      return problem(502, 'CONTACT_UPSTREAM', 'Bad gateway', 'The message service is unavailable.');
  }
}

function methodNotAllowed(): Response {
  return new Response(null, { status: 405, headers: { ...HEADERS, Allow: 'POST' } });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
