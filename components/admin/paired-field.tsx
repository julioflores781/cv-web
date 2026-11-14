'use client';

import type { ReactNode } from 'react';
import { adminMessage, UI } from '@/lib/admin/messages';
import { codePoints } from '@/lib/admin/content/validate';
import styles from './editor.module.css';

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Code of the violation shown under the field (`REQUIRED`); the text comes from `lib/admin/messages.ts`. */
  error?: string | undefined;
  multiline?: boolean;
  /** Shows a «n de max» counter (code points, like the API). Nothing is cut: going over is reported as an error. */
  max?: number;
  hint?: string;
  readOnly?: boolean;
  inputMode?: 'text' | 'decimal' | 'url';
  autoComplete?: string;
  disabled?: boolean;
  /** Ids of hidden elements appended to the visible label in the accessible name (`Título (español · Proyecto X)`), so names stay unique. */
  labelledBy?: string | undefined;
  /** Language of what is typed, when the field is not inside a column that sets it. */
  lang?: string | undefined;
}

/** An error under a field: prefix, icon and the message of `code` (or a `text` of the panel itself). */
export function FieldError({ id, code, text }: { id: string; code?: string; text?: string }) {
  return (
    <span id={id} className={styles.error} lang="es">
      <svg className={styles.errorIcon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M10 2 18.5 17H1.5Z M10 7.5v4.5 M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span>
        {UI.errorPrefix} {text ?? adminMessage(code)}
      </span>
    </span>
  );
}

/** A labelled text input (or textarea) with its hint, counter and error tied by `aria-describedby`. */
export function TextField(props: TextFieldProps) {
  const { id, label, value, onChange, error, multiline = false, max, hint, readOnly = false, inputMode, autoComplete = 'off', disabled = false, labelledBy, lang } = props;
  const described = [hint ? `${id}-hint` : null, max ? `${id}-count` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    className: styles.input,
    value,
    readOnly,
    disabled,
    autoComplete,
    lang,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': described,
    'aria-labelledby': labelledBy ? `${id}-label ${labelledBy}` : undefined,
  } as const;
  return (
    <div className={styles.field}>
      {/* The interface is Spanish even inside the English column, whose `lang` applies to what is typed. */}
      <label id={`${id}-label`} className={styles.legend} htmlFor={id} lang="es">
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...common} type="text" inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint || max ? (
        <span className={styles.meta} lang="es">
          {hint ? <span id={`${id}-hint`}>{hint}</span> : null}
          {max ? <span id={`${id}-count`}>{UI.editor.counter(codePoints(value), max)}</span> : null}
        </span>
      ) : null}
      {error ? <FieldError id={`${id}-error`} code={error} /> : null}
    </div>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
  labelledBy?: string | undefined;
}

/** A labelled `<select>` with its hint and error. A stored value outside the options stays selectable, so nothing changes until the user picks. */
export function SelectField({ id, label, value, options, onChange, error, hint, labelledBy }: SelectFieldProps) {
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label id={`${id}-label`} className={styles.legend} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.input}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        aria-labelledby={labelledBy ? `${id}-label ${labelledBy}` : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span className={styles.meta}>
          <span id={`${id}-hint`}>{hint}</span>
        </span>
      ) : null}
      {error ? <FieldError id={`${id}-error`} code={error} /> : null}
    </div>
  );
}

interface PairedFieldsProps {
  /** Fields that are the same in both languages: edited once. */
  common?: ReactNode;
  es: ReactNode;
  en: ReactNode;
}

/** The common block once, then a Spanish and an English column (`lang` on each), side by side from 900 px and stacked below. */
export function PairedFields({ common, es, en }: PairedFieldsProps) {
  return (
    <div className={styles.pair}>
      {common ? (
        <fieldset className={styles.block}>
          <legend className={styles.legend}>{UI.editor.common}</legend>
          {common}
        </fieldset>
      ) : null}
      <div className={styles.columns}>
        <fieldset className={styles.block} lang="es">
          <legend className={styles.legend} lang="es">
            {UI.editor.langs.es}
          </legend>
          {es}
        </fieldset>
        <fieldset className={styles.block} lang="en">
          <legend className={styles.legend} lang="es">
            {UI.editor.langs.en}
          </legend>
          {en}
        </fieldset>
      </div>
    </div>
  );
}
