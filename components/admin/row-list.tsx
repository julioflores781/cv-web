'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { UI } from '@/lib/admin/messages';
import { FieldError } from './paired-field';
import form from './form.module.css';
import styles from './projects.module.css';
import editor from './editor.module.css';

interface RowListProps<T> {
  /** DOM id of the group: the target of the list-level errors (`TOO_MANY`). */
  id: string;
  legend: string;
  items: readonly T[];
  max: number;
  addLabel: string;
  limitText: string;
  /** How a row is named in its buttons and announcements («el logro 2»). */
  rowName: (index: number) => string;
  empty: () => T;
  /** `reordered` is true when rows moved or one went away (anything tied to a row's position no longer points at it). */
  onChange: (items: T[], reordered: boolean) => void;
  /** Error code of the whole list, if any. */
  error?: string | undefined;
  /** Extra control under the list («Copiar ES → EN»). */
  extra?: ReactNode;
  /** Appended to the names of the buttons so they stay unique across columns and items («(español · Proyecto 1: …)»). */
  context?: string | undefined;
  children: (item: T, index: number, set: (item: T) => void) => ReactNode;
}

type Focus = { index: number; target: 'field' | 'up' | 'down' } | { index: null; target: 'add' };

/**
 * An ordered list of small rows inside one language column (highlights, links): add (focus to its first field), remove (focus to the next row or
 * to «add»), move up and down (inert at the ends, the focus follows the row and the new position is announced). The cap disables «add».
 */
export function RowList<T>({ id, legend, items, max, addLabel, limitText, rowName, empty, onChange, error, extra, context, children }: RowListProps<T>) {
  const named = (label: string): string => (context ? `${label} ${context}` : label);
  const root = useRef<HTMLFieldSetElement>(null);
  const focus = useRef<Focus | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const full = items.length >= max;
  const T = UI.projects.rows;

  useEffect(() => {
    const wanted = focus.current;
    const container = root.current;
    if (!wanted || !container) return;
    focus.current = null;
    if (wanted.index === null) {
      container.querySelector<HTMLElement>('[data-row-add]')?.focus();
      return;
    }
    const row = container.querySelector<HTMLElement>(`[data-row="${wanted.index}"]`);
    const target = wanted.target === 'field' ? row?.querySelector<HTMLElement>('input, textarea') : row?.querySelector<HTMLElement>(`[data-row-move="${wanted.target}"]`);
    target?.focus();
  });

  const set = (index: number, item: T) => onChange(items.map((current, i) => (i === index ? item : current)), false);
  const add = () => {
    if (full) return;
    onChange([...items, empty()], false);
    focus.current = { index: items.length, target: 'field' };
  };
  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index), true);
    focus.current = items.length > 1 ? { index: Math.min(index, items.length - 2), target: 'field' } : { index: null, target: 'add' };
  };
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved as T);
    onChange(next, true);
    focus.current = { index: to, target: delta < 0 ? 'up' : 'down' };
    setAnnouncement(T.moved(rowName(to), to + 1, items.length));
  };

  return (
    // The interface is Spanish; each field inside sets the language of what is typed.
    <fieldset ref={root} id={id} lang="es" tabIndex={-1} className={styles.group} data-invalid={error ? 'true' : undefined} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className={editor.legend}>{legend}</legend>
      {error ? <FieldError id={`${id}-error`} code={error} /> : null}
      {items.length > 0 ? (
        <ol className={styles.rows}>
          {items.map((item, index) => {
            const name = rowName(index);
            return (
              <li key={index} className={styles.row} data-row={index}>
                {children(item, index, (next) => set(index, next))}
                <div className={styles.rowTools}>
                  <button type="button" data-row-move="up" className={styles.rowTool} aria-label={named(T.up(name))} aria-disabled={index === 0 ? true : undefined} onClick={() => move(index, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    data-row-move="down"
                    className={styles.rowTool}
                    aria-label={named(T.down(name))}
                    aria-disabled={index === items.length - 1 ? true : undefined}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className={styles.rowTool} aria-label={named(T.remove(name))} onClick={() => remove(index)}>
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className={editor.actions}>
        <button type="button" data-row-add className={form.secondary} aria-label={context ? named(addLabel) : undefined} aria-disabled={full ? true : undefined} aria-describedby={full ? `${id}-limit` : undefined} onClick={add}>
          {addLabel}
        </button>
        {extra}
      </div>
      {full ? (
        <p id={`${id}-limit`} className={styles.note}>
          {limitText}
        </p>
      ) : null}
      <p role="status" className={editor.visuallyHidden}>
        {announcement}
      </p>
    </fieldset>
  );
}
