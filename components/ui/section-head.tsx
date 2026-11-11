import type { ReactNode } from 'react';
import { Eyebrow } from './eyebrow';
import styles from './ui.module.css';

interface SectionHeadProps {
  /** 1-based position among the rendered numbered sections; the view computes it. */
  index: number;
  label: string;
  title: string;
  /** Id of the h2 (the section's `aria-labelledby`). */
  titleId: string;
  /** Larger, bolder title (the contact section). */
  large?: boolean;
  wide?: boolean;
  /** Head row: title block on the left and the short text on the right (stacked sections). */
  row?: boolean;
  /** Short paragraph under the title. */
  text?: string;
  /** Actions under the text. */
  children?: ReactNode;
}

export function SectionHead({ index, label, title, titleId, large = false, wide = false, row = false, text, children }: SectionHeadProps) {
  if (row) {
    return (
      <div className={styles.headRow}>
        <div className={styles.headRowTitle}>
          <Eyebrow>{`${String(index).padStart(2, '0')} / ${label}`}</Eyebrow>
          <h2 id={titleId} className={`${styles.title} display`} data-probe="h2">
            {title}
          </h2>
        </div>
        {text ? <p className={styles.rowText}>{text}</p> : null}
      </div>
    );
  }
  return (
    <div className={wide ? `${styles.head} ${styles.headWide}` : styles.head}>
      <Eyebrow>{`${String(index).padStart(2, '0')} / ${label}`}</Eyebrow>
      <h2 id={titleId} className={`${styles.title} ${large ? styles.titleXl : ''} display`} data-probe={large ? 'contact-title' : 'h2'}>
        {title}
      </h2>
      {text ? <p className={styles.text}>{text}</p> : null}
      {children}
    </div>
  );
}
