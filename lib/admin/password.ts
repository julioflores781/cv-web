export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export interface PasswordInput {
  current: string;
  next: string;
  confirm: string;
}

export interface PasswordErrors {
  current?: 'required';
  next?: 'required' | 'too-short' | 'too-long' | 'same-as-current';
  confirm?: 'mismatch';
}

/** Length in code points, like the API: an emoji counts as one. */
const length = (text: string): number => [...text].length;

/** The password policy of the API (12-128 code points, not the current one) plus the confirmation, checked before asking. */
export function validatePasswordChange({ current, next, confirm }: PasswordInput): PasswordErrors {
  const errors: PasswordErrors = {};
  if (current === '') errors.current = 'required';
  if (next === '') errors.next = 'required';
  else if (length(next) < PASSWORD_MIN) errors.next = 'too-short';
  else if (length(next) > PASSWORD_MAX) errors.next = 'too-long';
  else if (next === current) errors.next = 'same-as-current';
  if (next !== confirm) errors.confirm = 'mismatch';
  return errors;
}
