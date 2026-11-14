import type { Metadata } from 'next';
import { HistoryLink } from '@/components/admin/history-link';
import { LoadFailure } from '@/components/admin/load-failure';
import { ServicesEditor } from '@/components/admin/services-editor';
import styles from '@/components/admin/editor.module.css';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { getAdminContent } from '@/lib/api/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.services.title };

const PATH = '/admin/services/';

/** Services editor: the content is read on every visit (no cache); the form and the saves run in the browser through `/admin/api/content/services/`. */
export default async function ServicesPage() {
  const ctx = await pageContext();
  const result = await getAdminContent('services', ctx);
  expireOn401(result, PATH);
  return (
    <div className={styles.frame}>
      <h1 className={`${styles.title} display`}>{UI.services.title}</h1>
      <p className={styles.intro}>{UI.services.intro}</p>
      <HistoryLink kind="services" />
      {result.kind === 'ok' ? (
        <ServicesEditor initial={result.data} path={PATH} />
      ) : (
        <LoadFailure text={adminMessage(failureCode(result))} reference={result.requestId} retryHref={PATH} />
      )}
    </div>
  );
}
