import type { ReactNode } from 'react';
import { UI } from '@/lib/admin/messages';
import styles from './status-banner.module.css';

interface StatusBannerProps {
  /** `error` carries a text prefix, an icon and a thick border: the meaning never rests on colour alone. */
  tone: 'error' | 'info';
  role?: 'alert' | 'status';
  /** Request id of the failed call, shown so it can be matched with the API logs. */
  reference?: string | undefined;
  children: ReactNode;
}

export function StatusBanner({ tone, role, reference, children }: StatusBannerProps) {
  return (
    <div className={styles.banner} data-tone={tone} {...(role ? { role } : {})}>
      <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {tone === 'error' ? (
          <path d="M10 2 18.5 17H1.5Z M10 7.5v4.5 M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z M10 9v5 M10 6.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
      <p className={styles.text}>
        {tone === 'error' ? <strong>{UI.errorPrefix} </strong> : null}
        {children}
        {reference ? (
          <span className={`${styles.reference} mono`}>
            {' '}
            {UI.referenceLabel}: {reference}
          </span>
        ) : null}
      </p>
    </div>
  );
}
