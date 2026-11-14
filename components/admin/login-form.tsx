'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { adminFetch } from '@/lib/admin/browser-client';
import { LOGIN_FIELD } from '@/lib/admin/fields';
import { formatRemaining } from '@/lib/admin/format';
import { ADMIN_MESSAGES, CLIENT_FAILURES, GENERIC_MESSAGE, UI } from '@/lib/admin/messages';
import { safeNext } from '@/lib/admin/next-path';
import { StatusBanner } from './status-banner';
import styles from './form.module.css';

interface LoginFormProps {
  /** The session died (`?expired=1`). */
  expired?: boolean;
  /** Raw `?next=`; it is sanitised here before being followed. */
  next?: string | null | undefined;
  /** Full navigation (the layout must read the new cookie); injectable for tests. */
  navigate?: (url: string) => void;
}

const goTo = (url: string): void => window.location.assign(url);

export function LoginForm({ expired = false, next, navigate = goTo }: LoginFormProps) {
  const uid = useId();
  const input = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const wasLocked = useRef(false);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; reference?: string | undefined } | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [released, setReleased] = useState(false);
  const locked = remaining > 0;

  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setRemaining((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [locked]);

  // The reopening is announced once, when the countdown ends (not every second).
  useEffect(() => {
    if (remaining === 0 && wasLocked.current) {
      wasLocked.current = false;
      setError(null);
      setReleased(true);
    }
  }, [remaining]);

  const refocus = () => queueMicrotask(() => input.current?.focus());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || locked) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    setReleased(false);
    const result = await adminFetch('/admin/api/login/', { json: { [LOGIN_FIELD]: secret } });
    sending.current = false;
    setBusy(false);

    if (result.kind === 'ok') {
      navigate(safeNext(next));
      return;
    }
    if (result.kind === 'network' || result.kind === 'offline' || result.kind === 'timeout') {
      setError({ text: CLIENT_FAILURES[result.kind] });
      return;
    }
    setSecret('');
    refocus();
    if (result.kind === 'expired') {
      setError({ text: ADMIN_MESSAGES.ADMIN_UNAUTHORIZED ?? GENERIC_MESSAGE });
      return;
    }
    if (result.status === 429 && result.retryAfterSeconds !== undefined && result.retryAfterSeconds > 0) {
      wasLocked.current = true;
      setRemaining(result.retryAfterSeconds);
    }
    setError({ text: ADMIN_MESSAGES[result.code] ?? GENERIC_MESSAGE, reference: result.requestId });
  }

  return (
    <form className={styles.form} method="post" noValidate onSubmit={submit}>
      <div role="status" className={styles.status}>
        {released ? UI.login.unlocked : expired ? <StatusBanner tone="info">{UI.login.expired}</StatusBanner> : null}
      </div>
      {error ? (
        <StatusBanner tone="error" role="alert" reference={error.reference}>
          {error.text}
        </StatusBanner>
      ) : null}
      {locked ? (
        <p className={`${styles.countdown} mono`}>
          {UI.login.remaining}: {formatRemaining(remaining)}
        </p>
      ) : null}
      <div className={styles.group}>
        <label className={styles.label} htmlFor={`${uid}-secret`}>
          {UI.login.label}
        </label>
        <input
          ref={input}
          id={`${uid}-secret`}
          name="secret"
          type="password"
          autoComplete="current-password"
          className={styles.field}
          value={secret}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setSecret(event.target.value)}
        />
      </div>
      <button type="submit" className={styles.button} aria-disabled={busy || locked ? true : undefined}>
        {busy ? UI.login.sending : UI.login.submit}
      </button>
    </form>
  );
}
