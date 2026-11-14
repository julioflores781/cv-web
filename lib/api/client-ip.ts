import { isIP } from 'node:net';

const IP_MAX_LENGTH = 45;

/**
 * The IP address in a raw header value (`CF-Connecting-IP`), trimmed, or `undefined` when it is not exactly one valid IPv4/IPv6 address
 * (a list, text, an empty value or more than 45 characters). Anything that is not a plain address is never forwarded to the API.
 */
export function validIp(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  return value && value.length <= IP_MAX_LENGTH && isIP(value) !== 0 ? value : undefined;
}
