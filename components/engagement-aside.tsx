'use client';

import { useId } from 'react';
import { Cta } from './ui/cta';
import { useRequiredEngagement } from './engagement-provider';
import styles from './engagement-aside.module.css';

export interface EngagementLabels {
  title: string;
  empty: string;
  reply: string;
  cta: string;
}

/** «Tu encargo»: the marked services, a reply promise and the way to the form. */
export function EngagementAside({ labels }: { labels: EngagementLabels }) {
  const { selected } = useRequiredEngagement();
  const titleId = useId();
  return (
    <aside className={styles.aside} aria-labelledby={titleId} data-probe="aside">
      <p id={titleId} className={`${styles.title} mono`}>
        {labels.title}
      </p>
      <div aria-live="polite">
        {selected.length > 0 ? (
          <ul className={styles.list}>
            {selected.map((title, i) => (
              <li key={`${i}|${title}`} className={`${styles.row} display`} data-probe="aside-row">
                {title}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{labels.empty}</p>
        )}
      </div>
      <p className={styles.reply}>{labels.reply}</p>
      <Cta href="#contact" compact>
        {labels.cta}
      </Cta>
    </aside>
  );
}
