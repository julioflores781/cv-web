import type { ReactNode } from 'react';
import styles from './ui.module.css';

/** Text shown inside a section whose list is empty. Plain paragraph: it is not an error, so no alert or live region. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className={styles.empty} data-probe="empty">
      {children}
    </p>
  );
}
