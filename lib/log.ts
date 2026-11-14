export type LogLevel = 'info' | 'warn' | 'error';

/** Values worth logging are primitives; everything else is dropped (see `sanitize`). */
export type LogFields = Record<string, unknown>;

const SERVICE = 'cv-web';
const MAX_VALUE_LENGTH = 200;
/** Keys that may carry personal data or secrets: never written, whatever the caller passes. */
const BLOCKED_KEYS = new Set(['password', 'token', 'authorization', 'cookie', 'email', 'message', 'name', 'ip', 'body', 'website']);
// Control characters (line breaks included) would let a value forge a second line.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;

/** Key as compared with the block list: NFKC, lower case and only letters and digits (so ` email`, `e\nmail`, `E-mail` and zero-width tricks match). */
const normalizeKey = (key: string): string => key.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');

function clean(text: string): string {
  const flat = text.replace(CONTROL_CHARS, ' ').replace(/"/g, "'");
  return flat.length > MAX_VALUE_LENGTH ? `${flat.slice(0, MAX_VALUE_LENGTH - 1)}…` : flat;
}

/** The loggable form of a value, or `undefined` when it must be dropped. Errors become their class name (the message may hold URLs or data). */
function sanitize(value: unknown): string | number | boolean | null | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return clean(value);
  if (value instanceof Error) return clean(value.name || value.constructor.name);
  return undefined;
}

const SINK: Record<LogLevel, (line: string) => void> = {
  info: (line) => console.info(line),
  warn: (line) => console.warn(line),
  error: (line) => console.error(line),
};

/**
 * One JSON line per event: stdout for `info`, stderr for `warn` and `error`. Never throws (a logging problem must not break a request)
 * and is the only place of the app that touches `console`. Pass `request_id` among the fields to correlate with the API.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  try {
    const entry: Record<string, string | number | boolean | null> = { timestamp: new Date().toISOString(), level, service: SERVICE, event: clean(event) };
    for (const [key, raw] of Object.entries(fields)) {
      if (BLOCKED_KEYS.has(normalizeKey(key)) || key in entry) continue;
      const value = sanitize(raw);
      if (value !== undefined) entry[clean(key)] = value;
    }
    SINK[level](JSON.stringify(entry));
  } catch {
    // Dropped on purpose: logging is best effort.
  }
}
