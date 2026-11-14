'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin/browser-client';
import { formatRemaining } from '@/lib/admin/format';
import { ADMIN_MESSAGES, CLIENT_FAILURES, GENERIC_MESSAGE, UI } from '@/lib/admin/messages';
import { expiredLoginUrl } from '@/lib/admin/next-path';
import { validatePasswordChange, type PasswordErrors } from '@/lib/admin/password';
import { StatusBanner } from './status-banner';
import styles from './form.module.css';

interface PasswordFormProps {
  /** Page to come back to after a re-login (default: the settings page). */
  path?: string;
  navigate?: (url: string) => void;
}

const goTo = (url: string): void => window.location.assign(url);
const TEXT = UI.passwordChange;
const EMPTY = { current: '', next: '', confirm: '' };
type Field = keyof typeof EMPTY;
const ORDER: readonly Field[] = ['current', 'next', 'confirm'];

export function PasswordForm({ path = '/admin/settings/', navigate = goTo }: PasswordFormProps) {
  const uid = useId();
  const refs = { current: useRef<HTMLInputElement>(null), next: useRef<HTMLInputElement>(null), confirm: useRef<HTMLInputElement>(null) };
  const sending = useRef(false);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; reference?: string | undefined } | null>(null);
  const [done, setDone] = useState(false);

  const ids = (field: Field) => ({ input: `${uid}-${field}`, error: `${uid}-${field}-error` });
  const change = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    setDone(false);
    setFailure(null);
    const found = validatePasswordChange(values);
    setErrors(found);
    const first = ORDER.find((field) => found[field]);
    if (first) {
      refs[first].current?.focus();
      return;
    }

    sending.current = true;
    setBusy(true);
    const result = await adminFetch('/admin/api/password/', { method: 'POST', json: { currentPassword: values.current, newPassword: values.next } });
    sending.current = false;
    setBusy(false);

    switch (result.kind) {
      case 'ok':
        setValues(EMPTY);
        setDone(true);
        return;
      case 'expired':
        navigate(expiredLoginUrl(path));
        return;
      case 'problem': {
        const base = ADMIN_MESSAGES[result.code] ?? GENERIC_MESSAGE;
        const wait = result.retryAfterSeconds !== undefined && result.retryAfterSeconds > 0 ? ` Tiempo restante: ${formatRemaining(result.retryAfterSeconds)}.` : '';
        const counts = result.code === 'ADMIN_CURRENT_PASSWORD_WRONG' ? ` ${TEXT.countsHint}` : '';
        setFailure({ text: `${base}${wait}${counts}`, reference: result.requestId });
        return;
      }
      default:
        setFailure({ text: CLIENT_FAILURES[result.kind] });
    }
  }

  const field = (name: Field, label: string, autoComplete: string, hint?: string) => {
    const code = errors[name];
    const described = [hint ? `${ids(name).input}-hint` : null, code ? ids(name).error : null].filter(Boolean).join(' ') || undefined;
    return (
      <div className={styles.group}>
        <label className={styles.label} htmlFor={ids(name).input}>
          {label}
        </label>
        <input
          ref={refs[name]}
          id={ids(name).input}
          name={name}
          type="password"
          autoComplete={autoComplete}
          className={styles.field}
          value={values[name]}
          aria-invalid={code ? true : undefined}
          aria-describedby={described}
          onChange={(event) => change(name, event.target.value)}
        />
        {hint ? (
          <span id={`${ids(name).input}-hint`} className={styles.hint}>
            {hint}
          </span>
        ) : null}
        {code ? (
          <span id={ids(name).error} className={styles.fieldError}>
            {TEXT.errors[code]}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <form className={styles.form} method="post" noValidate onSubmit={submit}>
      {failure ? (
        <StatusBanner tone="error" role="alert" reference={failure.reference}>
          {failure.text}
        </StatusBanner>
      ) : null}
      <div role="status" className={styles.status}>
        {done ? <StatusBanner tone="info">{TEXT.success}</StatusBanner> : null}
      </div>
      {field('current', TEXT.current, 'current-password')}
      {field('next', TEXT.next, 'new-password', TEXT.hint)}
      {field('confirm', TEXT.confirm, 'new-password')}
      <button type="submit" className={styles.button} aria-disabled={busy ? true : undefined}>
        {busy ? TEXT.saving : TEXT.submit}
      </button>
    </form>
  );
}
