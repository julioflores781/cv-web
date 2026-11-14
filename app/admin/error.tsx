'use client';

import { UI } from '@/lib/admin/messages';
import { StatusBanner } from '@/components/admin/status-banner';
import form from '@/components/admin/form.module.css';
import styles from '@/components/admin/notice.module.css';

/** Anything unexpected in the panel: a Spanish message and the digest as reference; no trace, no URL of the API. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className={styles.page}>
      <h1 className={`${styles.title} display`}>{UI.failure.title}</h1>
      <StatusBanner tone="error" role="alert" reference={error.digest}>
        {UI.failure.text}
      </StatusBanner>
      <div>
        <button type="button" className={form.button} onClick={reset}>
          {UI.failure.retry}
        </button>
      </div>
    </main>
  );
}
