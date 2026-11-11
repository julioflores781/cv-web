export type ContactField = 'name' | 'email' | 'message';

export type ContactErrorCode = 'required' | 'too-long' | 'too-short' | 'invalid-format';

/** Server limits (mirrored here so the form can answer before sending). */
export const NAME_MAX = 100;
export const EMAIL_MAX = 254;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

export interface ContactValues {
  name: string;
  email: string;
  message: string;
}

export type ContactErrors = Partial<Record<ContactField, ContactErrorCode>>;

/** Outcome of `sendContactMessage`; it never throws. */
export type SendResult =
  | { kind: 'sent' }
  | { kind: 'invalid'; field?: ContactField; title: string; detail: string; code: string }
  | { kind: 'rate-limited' }
  | { kind: 'problem'; title: string; detail: string; code: string; status: number }
  | { kind: 'http-error'; status: number }
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'aborted' };
