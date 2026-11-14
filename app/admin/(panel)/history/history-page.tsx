import type { ReactNode } from 'react';
import { HistoryView, type SnapshotState } from '@/components/admin/history-view';
import { LoadFailure } from '@/components/admin/load-failure';
import styles from '@/components/admin/editor.module.css';
import { HISTORY_LIMIT, historyUrl, parseLang, parseVersionParam } from '@/lib/admin/history';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { getAdminContent, getVersion, listVersions, type AdminResult, type ContentKind, type VersionSnapshot } from '@/lib/api/admin';
import { newRequestId } from '@/lib/request-id';

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function snapshotState(result: AdminResult<VersionSnapshot> | null, version: number | null): SnapshotState | null {
  if (result === null || version === null) return null;
  if (result.kind === 'ok') return { kind: 'ok', data: result.data };
  if (result.kind === 'problem' && result.status === 404) return { kind: 'missing', version };
  return { kind: 'failed', text: adminMessage(failureCode(result)), reference: result.requestId };
}

/**
 * The history screen of `kind`, shared by `history/{services,projects,architecture}/page.tsx`. Each kind has its own static route (not a
 * `[kind]` segment) so any other path falls to `app/admin/[...rest]` and is a real 404: a `notFound()` here would come after the panel's
 * `loading.tsx` boundary has already streamed a 200.
 *
 * History of one kind in one language (`?lang=es|en`, Spanish by default): the newest 50 versions, what is active now in both languages and,
 * with `?v=N`, that snapshot. Each read has its own request id; nothing is cached. The rollback runs in the browser through
 * `/admin/api/content/{kind}/{lang}/rollback/`.
 */
export async function HistoryPage({ kind, searchParams }: { kind: ContentKind; searchParams: SearchParams }) {
  const search = await searchParams;
  const lang = parseLang(search.lang);
  const version = parseVersionParam(search.v);
  const path = historyUrl(kind, lang, version);

  const ctx = await pageContext();
  const [versions, current, snapshot] = await Promise.all([
    listVersions(kind, lang, ctx, HISTORY_LIMIT),
    getAdminContent(kind, { ...ctx, requestId: newRequestId() }),
    version === null ? Promise.resolve(null) : getVersion(kind, lang, version, { ...ctx, requestId: newRequestId() }),
  ]);
  expireOn401(versions, path);
  expireOn401(current, path);
  if (snapshot !== null) expireOn401(snapshot, path);

  let body: ReactNode;
  if (versions.kind !== 'ok') {
    body = <LoadFailure text={adminMessage(failureCode(versions))} reference={versions.requestId} retryHref={path} />;
  } else if (current.kind !== 'ok') {
    body = <LoadFailure text={adminMessage(failureCode(current))} reference={current.requestId} retryHref={path} />;
  } else {
    body = (
      <HistoryView
        key={path}
        kind={kind}
        lang={lang}
        versions={versions.data.versions}
        current={current.data}
        snapshot={snapshotState(snapshot, version)}
        capped={versions.data.versions.length >= HISTORY_LIMIT}
      />
    );
  }

  return (
    <div className={styles.frame}>
      <h1 className={`${styles.title} display`}>{UI.history.heading(UI.dashboard.kinds[kind])}</h1>
      <p className={styles.intro}>{UI.history.intro}</p>
      {body}
    </div>
  );
}
