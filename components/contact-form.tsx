'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { effectiveMessageMax, sendContactMessage, validateContact, MESSAGE_MIN, NAME_MAX, EMAIL_MAX } from '@/lib/contact';
import type { ContactErrors, ContactField, SendResult } from '@/lib/contact';
import type { Lang } from '@/lib/i18n/config';
import { interpolate } from '@/lib/i18n/interpolate';
import { useEngagement } from './engagement-provider';
import styles from './contact-form.module.css';

export interface ContactFormLabels {
  name: string;
  email: string;
  /** Label of the message field for this page. */
  message: string;
  send: string;
  sending: string;
  prefix: string;
  honeypot: string;
  noscript: string;
  success: string;
  errors: {
    name: Record<'required' | 'too-long', string>;
    email: Record<'required' | 'too-long' | 'invalid-format', string>;
    message: Record<'too-short' | 'too-long', string>;
  };
  failures: {
    invalid: string;
    rateLimited: string;
    network: string;
    offline: string;
    timeout: string;
    server: string;
    fallback: string;
  };
}

interface ContactFormProps {
  lang: Lang;
  /** Public contact address, offered as the way out of every error. */
  email: string;
  labels: ContactFormLabels;
}

const ORDER: readonly ContactField[] = ['name', 'email', 'message'];
const EMPTY = { name: '', email: '', message: '' };

/** Result messages the form shows, without the `mailto` tail: `[text, field to blame]`. */
function failureOf(result: SendResult, labels: ContactFormLabels['failures'], online: boolean): { text: string; field?: ContactField } | null {
  switch (result.kind) {
    case 'sent':
    case 'aborted':
      return null;
    case 'invalid':
      return result.field ? { text: labels.invalid, field: result.field } : { text: result.detail || labels.invalid };
    case 'rate-limited':
      return { text: labels.rateLimited };
    case 'network':
      return { text: online ? labels.network : labels.offline };
    case 'timeout':
      return { text: labels.timeout };
    case 'problem':
    case 'http-error':
      return { text: labels.server };
  }
}

export function ContactForm({ lang, email, labels }: ContactFormProps) {
  const uid = useId();
  const engagement = useEngagement();
  const [values, setValues] = useState(EMPTY);
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<ContactErrors>({});
  const [apiFieldError, setApiFieldError] = useState<{ field: ContactField; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState('');
  const [failure, setFailure] = useState('');
  const sendingRef = useRef(false);
  const aborter = useRef<AbortController | null>(null);
  const fields = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    message: useRef<HTMLTextAreaElement>(null),
  };
  const statusRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  // Without JavaScript the fieldset stays disabled (the noscript explains it); once hydrated the form is usable.
  useEffect(() => {
    setReady(true);
    return () => aborter.current?.abort();
  }, []);

  const selected = engagement?.selected ?? [];
  // The prefix block (line + blank line) counts towards the 2000 characters but not towards the 10 minimum.
  const prefix = selected.length > 0 ? `${interpolate(labels.prefix, { services: selected.join(' + ') })}\n\n` : '';
  const max = effectiveMessageMax(prefix);
  const ids = { name: `${uid}-name`, email: `${uid}-email`, message: `${uid}-message`, counter: `${uid}-counter` };

  const errorText = (field: ContactField): string | null => {
    if (apiFieldError?.field === field) return apiFieldError.text;
    const code = errors[field];
    if (!code) return null;
    const table = labels.errors[field] as Record<string, string>;
    return interpolate(table[code] ?? '', {
      max: String(field === 'name' ? NAME_MAX : field === 'email' ? EMAIL_MAX : max),
      min: String(MESSAGE_MIN),
    });
  };

  const change = (field: ContactField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
    if (apiFieldError?.field === field) setApiFieldError(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingRef.current) return;
    setSuccess('');
    setFailure('');
    setApiFieldError(null);
    const found = validateContact(values, prefix);
    setErrors(found);
    const first = ORDER.find((field) => found[field]);
    if (first) {
      fields[first].current?.focus();
      return;
    }

    sendingRef.current = true;
    setSending(true);
    aborter.current = new AbortController();
    const result = await sendContactMessage({
      lang,
      values: { name: values.name, email: values.email, message: `${prefix}${values.message.trim()}` },
      website,
      signal: aborter.current.signal,
    });
    sendingRef.current = false;
    if (result.kind === 'aborted') return;
    setSending(false);

    if (result.kind === 'sent') {
      setValues(EMPTY);
      setWebsite('');
      setSuccess(labels.success);
      queueMicrotask(() => statusRef.current?.focus());
      return;
    }
    const failed = failureOf(result, labels.failures, typeof navigator === 'undefined' ? true : navigator.onLine);
    if (!failed) return;
    setFailure(failed.text);
    if (failed.field && result.kind === 'invalid') {
      setApiFieldError({ field: failed.field, text: result.detail });
      queueMicrotask(() => fields[failed.field as ContactField].current?.focus());
    } else {
      queueMicrotask(() => alertRef.current?.focus());
    }
  }

  const describedBy = (field: ContactField) =>
    [field === 'message' ? ids.counter : null, errorText(field) ? `${ids[field]}-error` : null].filter(Boolean).join(' ') || undefined;

  const group = (field: ContactField, text: string, control: ReactNode, extra?: ReactNode) => (
    <div className={styles.group}>
      <label className={styles.label} htmlFor={ids[field]}>
        {text}
      </label>
      {control}
      {extra}
      {errorText(field) ? (
        <span id={`${ids[field]}-error`} className={styles.error}>
          {errorText(field)}
        </span>
      ) : null}
    </div>
  );

  const input = (field: 'name' | 'email', type: 'text' | 'email', autoComplete: string) =>
    group(
      field,
      labels[field],
      <input
        ref={fields[field]}
        id={ids[field]}
        name={field}
        type={type}
        autoComplete={autoComplete}
        className={styles.field}
        value={values[field]}
        aria-invalid={errorText(field) ? true : undefined}
        aria-describedby={describedBy(field)}
        onChange={(event) => change(field, event.target.value)}
        data-probe="contact-field"
      />,
    );

  const [fallbackBefore = '', fallbackAfter = ''] = labels.failures.fallback.split('{email}');

  return (
    <form className={styles.form} method="post" noValidate onSubmit={submit} data-probe="contact-form">
      <fieldset className={styles.fieldset} disabled={!ready}>
        {input('name', 'text', 'name')}
        {input('email', 'email', 'email')}
        {group(
          'message',
          labels.message,
          <textarea
            ref={fields.message}
            id={ids.message}
            name="message"
            rows={4}
            className={`${styles.field} ${styles.textarea}`}
            value={values.message}
            aria-invalid={errorText('message') ? true : undefined}
            aria-describedby={describedBy('message')}
            onChange={(event) => change('message', event.target.value)}
          />,
          <span id={ids.counter} className={`${styles.counter} mono`}>
            {`${values.message.length}/${max}`}
          </span>,
        )}
        <div className={styles.trap} aria-hidden="true">
          <label htmlFor="contact-extra">{labels.honeypot}</label>
          <input
            id="contact-extra"
            name="contact-extra"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>
        <button type="submit" className={styles.button} aria-disabled={sending ? true : undefined} data-probe="contact-button">
          {sending ? labels.sending : labels.send}
        </button>
      </fieldset>
      <noscript>
        <p className={styles.noscript}>{interpolate(labels.noscript, { email })}</p>
      </noscript>
      <div role="status" tabIndex={-1} ref={statusRef} className={styles.status}>
        {success}
      </div>
      <div role="alert" tabIndex={-1} ref={alertRef} className={styles.alert}>
        {failure ? (
          <p>
            {failure} {fallbackBefore}
            <a href={`mailto:${email}`}>{email}</a>
            {fallbackAfter}
          </p>
        ) : null}
      </div>
    </form>
  );
}
