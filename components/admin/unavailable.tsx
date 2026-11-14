import Link from 'next/link';
import { UI } from '@/lib/admin/messages';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import styles from './notice.module.css';

/** The API cannot be reached: the panel says so and offers a reload (a link, so it needs no client code). */
export function Unavailable({ reference }: { reference: string }) {
  return (
    <main className={styles.page}>
      <h1 className={`${styles.title} display`}>{UI.unavailable.title}</h1>
      <StatusBanner tone="error" role="alert" reference={reference}>
        {UI.unavailable.text}
      </StatusBanner>
      <div>
        <Link className={`${form.button} ${styles.action}`} href="/admin/">
          {UI.unavailable.retry}
        </Link>
      </div>
    </main>
  );
}
