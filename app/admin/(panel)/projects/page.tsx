import type { Metadata } from 'next';
import { HistoryLink } from '@/components/admin/history-link';
import { LoadFailure } from '@/components/admin/load-failure';
import { ProjectsEditor } from '@/components/admin/projects-editor';
import styles from '@/components/admin/editor.module.css';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { getAdminContent, listImages, type AdminCallContext } from '@/lib/api/admin';
import type { ImageLibrary } from '@/lib/admin/images';
import { newRequestId } from '@/lib/request-id';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.projects.title };

const PATH = '/admin/projects/';

/** The storage listing for thumbnails (its own request id, so each read has its reference); when it cannot be read the editor still works (no thumbnails, a notice in each image block). */
async function readLibrary(ctx: AdminCallContext): Promise<ImageLibrary> {
  const result = await listImages(ctx);
  expireOn401(result, PATH);
  return result.kind === 'ok' ? { kind: 'ok', images: result.data.map(({ key, url }) => ({ key, url })) } : { kind: 'unavailable', reference: result.requestId };
}

/**
 * Projects editor: the content and the image listing are read on every visit (no cache); the form, the uploads and the saves run in the
 * browser through `/admin/api/content/projects/` and `/admin/api/images/`.
 */
export default async function ProjectsPage() {
  const ctx = await pageContext();
  const [result, library] = await Promise.all([getAdminContent('projects', ctx), readLibrary({ ...ctx, requestId: newRequestId() })]);
  expireOn401(result, PATH);
  return (
    <div className={styles.frame}>
      <h1 className={`${styles.title} display`}>{UI.projects.title}</h1>
      <p className={styles.intro}>{UI.projects.intro}</p>
      <HistoryLink kind="projects" />
      {result.kind === 'ok' ? (
        <ProjectsEditor initial={result.data} path={PATH} library={library} />
      ) : (
        <LoadFailure text={adminMessage(failureCode(result))} reference={result.requestId} retryHref={PATH} />
      )}
    </div>
  );
}
