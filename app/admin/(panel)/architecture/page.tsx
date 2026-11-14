import type { Metadata } from 'next';
import { ArchitectureEditor } from '@/components/admin/architecture-editor';
import { HistoryLink } from '@/components/admin/history-link';
import { LoadFailure } from '@/components/admin/load-failure';
import styles from '@/components/admin/editor.module.css';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { getAdminContent } from '@/lib/api/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.architecture.title };

const PATH = '/admin/architecture/';

/** Architecture editor: the hexagon is read on every visit (no cache); the form, the preview and the saves run in the browser. */
export default async function ArchitecturePage() {
  const ctx = await pageContext();
  const result = await getAdminContent('architecture', ctx);
  expireOn401(result, PATH);
  return (
    <div className={styles.frame}>
      <h1 className={`${styles.title} display`}>{UI.architecture.title}</h1>
      <p className={styles.intro}>{UI.architecture.intro}</p>
      <HistoryLink kind="architecture" />
      {result.kind === 'ok' ? (
        <ArchitectureEditor initial={result.data} path={PATH} />
      ) : (
        <LoadFailure text={adminMessage(failureCode(result))} reference={result.requestId} retryHref={PATH} />
      )}
    </div>
  );
}
