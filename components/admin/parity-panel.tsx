'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContentLang, ViolationEntry } from '@/lib/api/admin';
import { adminMessage, UI } from '@/lib/admin/messages';
import { ConfirmDialog } from './confirm-dialog';
import form from './form.module.css';
import styles from './editor.module.css';

export interface UnpairedItem {
  key: string;
  label: string;
  /** The language it lacks. */
  missing: ContentLang;
}

/** A difference the draft keeps, with its one-click repair («Igualar EN a ES»). */
export interface ParityFixItem {
  key: string;
  label: string;
  text: string;
  onFix: () => void;
}

interface ParityPanelProps {
  /** Differences of the draft as it is now (only unpaired items can cause them: the common fields are shared). */
  local: readonly ViolationEntry[];
  /** `parity.differences` the API reported for the published documents. */
  published: readonly ViolationEntry[];
  unpaired: readonly UnpairedItem[];
  fixes?: readonly ParityFixItem[];
  onTwin: (key: string, lang: ContentLang) => void;
  onRemove: (key: string) => void;
}

/**
 * ES/EN parity: the count (announced), each unpaired item with «Crear gemelo» and «Quitar», the repairs the editor offers («Igualar EN a ES»)
 * and what the API saw in the published version.
 */
export function ParityPanel({ local, published, unpaired, fixes = [], onTwin, onRemove }: ParityPanelProps) {
  const [removing, setRemoving] = useState<UnpairedItem | null>(null);
  const root = useRef<HTMLElement>(null);
  // The repair or the unpaired item just handled goes away with its buttons, so the focus moves to the same action of the next one, or to the
  // panel title when none is left.
  const handled = useRef<{ action: 'fix' | 'twin' | 'remove'; index: number } | null>(null);
  const total = local.length + published.length;

  useEffect(() => {
    const done = handled.current;
    if (done === null || !root.current) return;
    handled.current = null;
    const buttons = root.current.querySelectorAll<HTMLElement>(`[data-${done.action}]`);
    (buttons[Math.min(done.index, buttons.length - 1)] ?? root.current.querySelector<HTMLElement>('#paridad-titulo'))?.focus();
  });
  return (
    <section ref={root} className={styles.panel} aria-labelledby="paridad-titulo">
      <h2 id="paridad-titulo" className={styles.panelTitle} tabIndex={-1}>
        {UI.editor.parity.title}
      </h2>
      <p role="status">{total === 0 ? UI.editor.parity.ok : UI.editor.parity.count(total)}</p>
      {unpaired.length > 0 ? (
        <ul className={styles.summaryList}>
          {unpaired.map((item, index) => {
            const lang = UI.editor.langs[item.missing === 'es' ? 'en' : 'es'] ?? '';
            const twinLang = UI.editor.langShort[item.missing] ?? item.missing;
            return (
              <li key={item.key}>
                <span>{UI.editor.parity.unpaired(item.label, lang.toLowerCase())}</span>{' '}
                <span className={styles.actions}>
                  <button
                    type="button"
                    data-twin
                    className={form.secondary}
                    onClick={() => {
                      handled.current = { action: 'twin', index };
                      onTwin(item.key, item.missing);
                    }}
                  >
                    {UI.editor.parity.twin(twinLang)}
                  </button>
                  <button type="button" data-remove className={form.secondary} aria-label={`${UI.editor.parity.remove} «${item.label}»`} onClick={() => setRemoving(item)}>
                    {UI.editor.parity.remove}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {fixes.length > 0 ? (
        <ul className={styles.summaryList}>
          {fixes.map((fix, index) => (
            <li key={fix.key}>
              <span>{fix.text}</span>{' '}
              <button
                type="button"
                data-fix
                className={form.secondary}
                aria-label={`${UI.editor.parity.equalize} «${fix.label}»`}
                onClick={() => {
                  handled.current = { action: 'fix', index };
                  fix.onFix();
                }}
              >
                {UI.editor.parity.equalize}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {published.length > 0 ? (
        <>
          <p>{UI.editor.parity.published}:</p>
          <ul className={styles.summaryList}>
            {published.map((entry) => (
              <li key={`${entry.path}|${entry.code}`}>
                <span className={`${styles.path} mono`}>{entry.path}</span> {adminMessage(entry.code)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={UI.editor.removeTitle}
        description={removing ? UI.editor.removeText(removing.label) : ''}
        confirmLabel={UI.editor.removeConfirm}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            handled.current = { action: 'remove', index: unpaired.findIndex((item) => item.key === removing.key) };
            onRemove(removing.key);
          }
          setRemoving(null);
        }}
      />
    </section>
  );
}
