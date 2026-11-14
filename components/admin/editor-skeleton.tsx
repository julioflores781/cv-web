import { UI } from '@/lib/admin/messages';
import styles from './editor.module.css';

/** Skeleton of an editor page while its content is read (`loading.tsx`). */
export function EditorSkeleton({ title }: { title: string }) {
  return (
    <div className={styles.frame} role="status" aria-busy="true">
      <h1 className={`${styles.title} display`}>{title}</h1>
      <p>{UI.loading}</p>
      <ul className={styles.list} aria-hidden="true">
        <li className={styles.item}>
          <div className={styles.itemHead}>…</div>
        </li>
        <li className={styles.item}>
          <div className={styles.itemHead}>…</div>
        </li>
      </ul>
    </div>
  );
}
