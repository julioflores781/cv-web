import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ImageGallery } from '@/components/admin/image-gallery';
import { LoadFailure } from '@/components/admin/load-failure';
import { StatusBanner } from '@/components/admin/status-banner';
import styles from '@/components/admin/editor.module.css';
import { imageKeysOf } from '@/lib/admin/content/projects';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { getAdminContent, listImages } from '@/lib/api/admin';
import { newRequestId } from '@/lib/request-id';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.images.title };

const PATH = '/admin/images/';

/**
 * Gallery of the storage: the listing and the published projects are read on every visit (the projects tell «in use» from «in use by an old
 * version»; if they cannot be read the gallery still works without that split). Deletes and the cleanup run in the browser.
 */
export default async function ImagesPage() {
  const ctx = await pageContext();
  const [listing, projects] = await Promise.all([listImages(ctx), getAdminContent('projects', { ...ctx, requestId: newRequestId() })]);
  expireOn401(listing, PATH);
  expireOn401(projects, PATH);

  let body: ReactNode;
  if (listing.kind === 'ok') {
    const current = projects.kind === 'ok' ? [...imageKeysOf(projects.data.languages.es.content, projects.data.languages.en.content)] : null;
    body = <ImageGallery images={listing.data} currentKeys={current} />;
  } else if (listing.kind === 'problem' && listing.status === 503 && listing.code === 'IMAGE_STORAGE_UNAVAILABLE') {
    body = (
      <StatusBanner tone="error" role="alert" reference={listing.requestId}>
        {UI.images.unavailable}
      </StatusBanner>
    );
  } else {
    body = <LoadFailure text={adminMessage(failureCode(listing))} reference={listing.requestId} retryHref={PATH} />;
  }

  return (
    <div className={styles.frame}>
      <h1 className={`${styles.title} display`}>{UI.images.title}</h1>
      <p className={styles.intro}>{UI.images.intro}</p>
      {body}
    </div>
  );
}
