import Link from 'next/link';
import { UI } from '@/lib/admin/messages';
import styles from '@/components/admin/notice.module.css';

export default function AdminNotFound() {
  return (
    <main className={styles.page}>
      <h1 className={`${styles.title} display`}>{UI.notFound.title}</h1>
      <p>{UI.notFound.text}</p>
      <p>
        <Link href="/admin/">{UI.notFound.back}</Link>
      </p>
    </main>
  );
}
