import { EMAIL_MAX, MESSAGE_MAX, MESSAGE_MIN, NAME_MAX, type ContactErrors, type ContactValues } from './types';

/** One @, no ASCII whitespace, a dot after the @ (same as the server). */
const EMAIL = /^[^@ \t\n\x0B\f\r]+@[^@ \t\n\x0B\f\r]+\.[^@ \t\n\x0B\f\r]+$/;

/** Largest message the user can type when `prefix` (the services line plus its separator) is prepended. */
export function effectiveMessageMax(prefix: string): number {
  return Math.max(0, MESSAGE_MAX - prefix.length);
}

/**
 * Mirrors the server rules on trimmed values, counting UTF-16 units with `.length`, and reports every error at once.
 * `prefix` is prepended to the message on send: the user's text alone must reach the minimum, and prefix + text the maximum.
 */
export function validateContact(values: ContactValues, prefix = ''): ContactErrors {
  const errors: ContactErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const text = values.message.trim();
  if (name.length === 0) errors.name = 'required';
  else if (name.length > NAME_MAX) errors.name = 'too-long';
  if (email.length === 0) errors.email = 'required';
  else if (email.length > EMAIL_MAX) errors.email = 'too-long';
  else if (!EMAIL.test(email)) errors.email = 'invalid-format';
  if (text.length < MESSAGE_MIN) errors.message = 'too-short';
  else if (`${prefix}${text}`.trim().length > MESSAGE_MAX) errors.message = 'too-long';
  return errors;
}
