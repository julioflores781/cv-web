/**
 * Text rules of the API as Java applies them, so the client mirror agrees with `ContentValidator` on the edges JavaScript sees differently:
 * - blank: `String.isBlank()`/`strip()` use `Character.isWhitespace`, which keeps U+00A0, U+2007, U+202F (non-breaking) and U+FEFF as text but
 *   treats U+001C–U+001F as blanks; `String.prototype.trim()` does the opposite on each of them.
 * - https URL: `new java.net.URI(text)` (RFC 2396, server-based authority) with scheme `https` and a host; WHATWG `new URL()` is laxer
 *   (it accepts `ex_ample.com`, IDN hosts, `|`, a bare `%`, and percent-encodes what Java refuses).
 * Browser-safe (no `node:*`). `scripts/parity/admin-fake.mjs` holds the same port; the shared vectors pin both.
 */

/** `Character.isWhitespace(c)` for one UTF-16 unit (every Java whitespace is in the BMP). */
export function isJavaWhitespace(code: number): boolean {
  if ((code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x20)) return true;
  if (code === 0x1680 || (code >= 0x2000 && code <= 0x2006) || (code >= 0x2008 && code <= 0x200a)) return true;
  return code === 0x2028 || code === 0x2029 || code === 0x205f || code === 0x3000;
}

/** `String.isBlank()`: empty or only Java whitespace. */
export function isJavaBlank(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) if (!isJavaWhitespace(text.charCodeAt(i))) return false;
  return true;
}

/** `String.strip()`: Java whitespace removed at both ends. */
export function javaStrip(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isJavaWhitespace(text.charCodeAt(start))) start += 1;
  while (end > start && isJavaWhitespace(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(start, end);
}

// Character classes of java.net.URI (RFC 2396 with Java's deviations).
const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHANUM = `${ALPHA}0123456789`;
const UNRESERVED = `${ALPHANUM}-_.!~*'()`;
const RESERVED = ';/?:@&=+$,[]';
const SCHEME = `${ALPHANUM}+-.`;
const USERINFO = `${UNRESERVED};:&=+$,`;
const PATH = `${UNRESERVED}:@&=+$,;/`;
const URIC = `${UNRESERVED}${RESERVED}`;
const HEX = /^[0-9A-Fa-f]$/;

/** `Character.isSpaceChar` (Zs, Zl, Zp) above U+0080. */
const isSpaceChar = (code: number): boolean =>
  code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000;
const isIsoControl = (code: number): boolean => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

/** Every unit is in `allowed`, a `%hh` escape or a visible non-ASCII character (Java's «other»). */
function legal(text: string, allowed: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    const code = text.charCodeAt(i);
    if (allowed.includes(char)) continue;
    if (char === '%') {
      if (!HEX.test(text[i + 1] ?? '') || !HEX.test(text[i + 2] ?? '')) return false;
      i += 2;
      continue;
    }
    if (code > 128 && !isSpaceChar(code) && !isIsoControl(code)) continue;
    return false;
  }
  return true;
}

const only = (text: string, allowed: string): boolean => [...text].every((char) => allowed.includes(char));

/** Four decimal bytes of at most three digits, each ≤255. */
function ipv4(text: string): boolean {
  const parts = text.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

/** `[a:b::c]` without the brackets: hex groups of 1–4 digits, one `::` at most, an IPv4 tail allowed, then an optional `%scope` (letters, digits, `_`, `.`). */
function ipv6(text: string): boolean {
  const percent = text.indexOf('%');
  if (percent >= 0) return /^[A-Za-z0-9_.]+$/.test(text.slice(percent + 1)) && ipv6(text.slice(0, percent));
  let body = text;
  let extra = 0;
  const tail = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(body);
  if (tail) {
    if (!ipv4(tail[1] as string)) return false;
    body = body.slice(0, body.length - (tail[1] as string).length);
    if (body.endsWith(':') && !body.endsWith('::')) body = body.slice(0, -1);
    extra = 2;
  }
  const halves = body.split('::');
  if (halves.length > 2) return false;
  const groups = (part: string): string[] | null => {
    if (part === '') return [];
    const list = part.split(':');
    return list.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group)) ? list : null;
  };
  const left = groups(halves[0] as string);
  const right = halves.length === 2 ? groups(halves[1] as string) : [];
  if (left === null || right === null) return false;
  const count = left.length + right.length + extra;
  return halves.length === 2 ? count <= 7 : count === 8;
}

/** RFC 2396 hostname as Java parses it: alphanumeric labels with inner dashes, an optional final dot; the last label starts with a letter when there are several. */
function hostname(text: string): boolean {
  const trimmed = text.endsWith('.') ? text.slice(0, -1) : text;
  if (trimmed === '') return false;
  const labels = trimmed.split('.');
  if (!labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return false;
  return labels.length === 1 || ALPHA.includes((labels.at(-1) as string)[0] as string);
}

/** The host of a server-based authority (`[userinfo@]host[:port]`), or `null` when Java would leave `getHost()` null or throw. */
function serverHost(authority: string): string | null {
  let rest = authority;
  const at = rest.indexOf('@');
  if (at >= 0) {
    if (!legal(rest.slice(0, at), USERINFO)) return null;
    rest = rest.slice(at + 1);
  }
  let host: string;
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0 || !ipv6(rest.slice(1, close))) return null;
    host = rest.slice(0, close + 1);
    rest = rest.slice(close + 1);
  } else {
    const colon = rest.indexOf(':');
    host = colon < 0 ? rest : rest.slice(0, colon);
    rest = colon < 0 ? '' : rest.slice(colon);
    if (!ipv4(host) && !hostname(host)) return null;
  }
  if (rest !== '') {
    const port = rest.slice(1);
    if (!rest.startsWith(':') || !/^\d*$/.test(port) || (port !== '' && Number(port) > 2_147_483_647)) return null;
  }
  return host;
}

/** `new java.net.URI(text)` succeeds, its scheme is `https` (any case) and `getHost()` is not null; at most 300 units, no Java whitespace. */
export function isHttpsUrl(text: string): boolean {
  if (text.length > 300 || [...text].some((char) => isJavaWhitespace(char.charCodeAt(0)))) return false;
  const hash = text.indexOf('#');
  const main = hash < 0 ? text : text.slice(0, hash);
  if (hash >= 0 && !legal(text.slice(hash + 1), URIC)) return false;
  const colon = main.search(/[:/?]/);
  if (colon <= 0 || main[colon] !== ':') return false;
  const scheme = main.slice(0, colon);
  if (!ALPHA.includes(scheme[0] as string) || !only(scheme, SCHEME) || scheme.toLowerCase() !== 'https') return false;
  const rest = main.slice(colon + 1);
  if (!rest.startsWith('//')) return false;
  const end = rest.slice(2).search(/[/?]/);
  const authority = end < 0 ? rest.slice(2) : rest.slice(2, end + 2);
  const after = end < 0 ? '' : rest.slice(end + 2);
  if (authority === '' || serverHost(authority) === null) return false;
  const question = after.indexOf('?');
  const path = question < 0 ? after : after.slice(0, question);
  const query = question < 0 ? '' : after.slice(question + 1);
  return legal(path, PATH) && legal(query, URIC);
}
