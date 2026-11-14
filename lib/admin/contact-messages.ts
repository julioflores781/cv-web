/** Messages per page. Fixed by the panel (the API takes 1 to 100): the visitor never chooses it. */
export const MESSAGES_LIMIT = 50;

const PATH = '/admin/messages/';

/**
 * A cursor (`?before=` of the page, or the `next` of the API): plain decimal digits, 1 up to the largest integer JavaScript keeps exact.
 * Anything else (absent, repeated, signed, decimal, huge) is ignored (`null`) and never reaches the API.
 */
export function parseCursor(raw: string | string[] | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^\d{1,16}$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 && Number.isSafeInteger(value) ? value : null;
}

/** `/admin/messages/` (the newest) or `/admin/messages/?before=40` (the ones older than message 40). */
export const messagesUrl = (before: number | null): string => (before === null ? PATH : `${PATH}?before=${before}`);

// Deliberately narrow: letters, digits and `._+-` before one `@`, a dotted host after it. No `?`, `&`, `%`, blanks or quotes, so the link
// can only open a message to that one address (no extra recipients, subject or body smuggled in).
const PLAIN_ADDRESS = /^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const MAX_ADDRESS = 254;

/** `mailto:` link of an address a visitor typed, or `null` when it is not a plain address (it is then shown as text only). */
export const mailtoHref = (email: string): string | null => (email.length <= MAX_ADDRESS && PLAIN_ADDRESS.test(email) ? `mailto:${email}` : null);
