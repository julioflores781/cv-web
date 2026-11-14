'use client';

import { useRef, useState, type ReactNode } from 'react';
import { codePoints } from '@/lib/admin/content/validate';
import { UI } from '@/lib/admin/messages';
import { FieldError } from './paired-field';
import form from './form.module.css';
import styles from './projects.module.css';
import editor from './editor.module.css';

interface TagListFieldProps {
  /** Id of the text input (the target of the errors of the list). */
  id: string;
  label: string;
  /** Language of the tags. */
  lang: string;
  tags: readonly string[];
  max: number;
  maxLength: number;
  onChange: (tags: string[]) => void;
  /** Error code of the list from the last save. */
  error?: string | undefined;
  labelledBy?: string | undefined;
  /** Appended to the names of the buttons so they stay unique across columns and items. */
  context?: string | undefined;
  /** Extra control («Copiar ES → EN»). */
  extra?: ReactNode;
}

type Problem = 'tooLong' | 'full' | 'duplicate';

/**
 * A list of short tags (the stack): typed in one input and added with Enter, a comma or the «add» button; each tag has its own labelled
 * remove button. Blank tags are ignored; one over `maxLength`, a repeated one or one past `max` is refused with a message and not added.
 */
export function TagListField({ id, label, lang, tags, max, maxLength, onChange, error, labelledBy, context, extra }: TagListFieldProps) {
  const named = (text: string): string => (context ? `${text} ${context}` : text);
  const [pending, setPending] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const T = UI.projects.stack;
  const full = tags.length >= max;

  /** Adds the given texts; returns what could not be added (to keep it in the input). */
  const add = (texts: readonly string[]): string => {
    let next = [...tags];
    let left = '';
    let refused: Problem | null = null;
    for (const raw of texts) {
      const tag = raw.trim();
      if (tag === '') continue;
      if (next.length >= max) refused = 'full';
      else if (codePoints(tag) > maxLength) refused = 'tooLong';
      else if (next.includes(tag)) refused = 'duplicate';
      else {
        next = [...next, tag];
        setAnnouncement(T.added(tag));
        continue;
      }
      left = raw;
    }
    setProblem(refused);
    if (next.length !== tags.length) onChange(next);
    return left;
  };

  const remove = (index: number) => {
    const tag = tags[index] ?? '';
    onChange(tags.filter((_, i) => i !== index));
    setProblem(null);
    setAnnouncement(T.removed(tag));
    input.current?.focus();
  };

  const described = [`${id}-hint`, `${id}-count`, error ? `${id}-error` : null, problem ? `${id}-problem` : null].filter(Boolean).join(' ');

  return (
    <div className={styles.group} data-invalid={error ? 'true' : undefined} lang="es">
      <label id={`${id}-label`} className={editor.legend} htmlFor={id}>
        {label}
      </label>
      {tags.length > 0 ? (
        <ul className={styles.chips} aria-label={T.list}>
          {tags.map((tag, index) => (
            <li key={`${index}-${tag}`} className={styles.chip}>
              <span lang={lang}>{tag}</span>
              <button type="button" className={styles.chipButton} aria-label={named(T.remove(tag))} onClick={() => remove(index)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.adder}>
        <input
          ref={input}
          id={id}
          className={editor.input}
          type="text"
          lang={lang}
          autoComplete="off"
          value={pending}
          aria-invalid={error || problem ? true : undefined}
          aria-describedby={described}
          aria-labelledby={labelledBy ? `${id}-label ${labelledBy}` : undefined}
          onChange={(event) => {
            const value = event.target.value;
            if (!value.includes(',')) {
              setPending(value);
              return;
            }
            // A comma (typed or pasted) closes every tag before it.
            const parts = value.split(',');
            const last = parts.pop() ?? '';
            // A refused tag stays in the input to be fixed.
            setPending(add(parts) || last);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            setPending(add([pending]));
          }}
        />
        <button type="button" className={form.secondary} aria-label={context ? named(T.add) : undefined} aria-disabled={full ? true : undefined} onClick={() => setPending(add([pending]))}>
          {T.add}
        </button>
      </div>
      <span className={editor.meta}>
        <span id={`${id}-hint`}>{T.hint}</span>
        <span id={`${id}-count`}>{T.count(tags.length, max)}</span>
      </span>
      {problem ? <FieldError id={`${id}-problem`} text={T[problem]} /> : null}
      {error ? <FieldError id={`${id}-error`} code={error} /> : null}
      {extra}
      <p role="status" className={editor.visuallyHidden}>
        {announcement}
      </p>
    </div>
  );
}
