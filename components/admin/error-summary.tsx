'use client';

import { forwardRef } from 'react';
import { adminMessage, UI } from '@/lib/admin/messages';
import styles from './editor.module.css';

export interface SummaryEntry {
  /** Unique within the summary. */
  id: string;
  /** Where it is (`Servicio 2 · Título (ES)`), or `General`. */
  where: string;
  code: string;
  /** Field to jump to; without it the entry is text only. */
  fieldId: string | null;
  /** Raw path for errors that match no field (shown in monospace so it can be reported). */
  path?: string;
}

/** Errors of a failed save: an alert that receives the focus and links each error to its field. Errors are text plus an icon, no colour. */
export const ErrorSummary = forwardRef<HTMLDivElement, { entries: SummaryEntry[]; extra?: string | null }>(function ErrorSummary({ entries, extra }, ref) {
  const jump = (fieldId: string) => (event: React.MouseEvent) => {
    const target = document.getElementById(fieldId);
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  return (
    <div ref={ref} className={styles.summary} role="alert" tabIndex={-1} aria-labelledby="resumen-errores">
      <p id="resumen-errores">
        <strong>{UI.errorPrefix}</strong> {UI.editor.summaryTitle}
      </p>
      <ul className={styles.summaryList}>
        {extra ? <li>{extra}</li> : null}
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.fieldId ? (
              <a href={`#${entry.fieldId}`} onClick={jump(entry.fieldId)}>
                {entry.where}: {adminMessage(entry.code)}
              </a>
            ) : (
              <>
                {entry.where}: {adminMessage(entry.code)}
                {entry.path ? <span className={`${styles.path} mono`}> ({entry.path})</span> : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
});
