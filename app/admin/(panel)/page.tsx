import type { Metadata } from 'next';
import Link from 'next/link';
import { LoadFailure } from '@/components/admin/load-failure';
import { LocalTime } from '@/components/admin/local-time';
import styles from '@/components/admin/dashboard.module.css';
import editor from '@/components/admin/editor.module.css';
import { KIND_ROUTES, KINDS } from '@/lib/admin/content/kinds';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { getAdminContent, type AdminContent, type AdminResult, type ContentKind } from '@/lib/api/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.dashboard.title };

const TEXT = UI.dashboard;

function ParityBadge({ content }: { content: AdminContent }) {
  const ok = content.parity.ok;
  return (
    <p className={styles.badge} data-ok={ok ? 'true' : 'false'}>
      <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {ok ? (
          <path d="M4 10.5 8 14.5 16 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M10 2 18.5 17H1.5Z M10 7.5v4.5 M10 14.2v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        )}
      </svg>
      {ok ? TEXT.parityOk : TEXT.parityBroken(content.parity.differences.length)}
    </p>
  );
}

function Card({ kind, result }: { kind: ContentKind; result: AdminResult<AdminContent> }) {
  const routes = KIND_ROUTES[kind];
  const title = TEXT.kinds[kind];
  if (result.kind !== 'ok') {
    return (
      <article className={styles.card} aria-labelledby={`tarjeta-${kind}`} data-state="error">
        <h2 id={`tarjeta-${kind}`} className={styles.cardTitle}>
          {title}
        </h2>
        <p>{TEXT.failed}</p>
        <LoadFailure text={adminMessage(failureCode(result))} reference={result.requestId} retryHref="/admin/" />
      </article>
    );
  }
  const { languages } = result.data;
  const unpublished = languages.es.version === 0 && languages.en.version === 0;
  const latest = [languages.es, languages.en].map((lang) => lang.publishedAt).filter((value): value is string => value !== null).sort().at(-1);
  const source = languages.es.source ?? languages.en.source;
  return (
    <article className={styles.card} aria-labelledby={`tarjeta-${kind}`}>
      <h2 id={`tarjeta-${kind}`} className={styles.cardTitle}>
        {title}
      </h2>
      {unpublished ? (
        <p className={styles.empty}>{TEXT.unpublished}</p>
      ) : (
        <dl className={styles.facts}>
          <div>
            <dt>{TEXT.version}</dt>
            <dd className="mono">
              ES v{languages.es.version} · EN v{languages.en.version}
            </dd>
          </div>
          <div>
            <dt>{TEXT.published}</dt>
            <dd>{latest ? <LocalTime value={latest} /> : '—'}</dd>
          </div>
          <div>
            <dt>{TEXT.source}</dt>
            <dd>{source ? (TEXT.sources[source] ?? TEXT.unknownSource) : '—'}</dd>
          </div>
        </dl>
      )}
      {unpublished ? null : <ParityBadge content={result.data} />}
      <div className={editor.actions}>
        <Link className={styles.link} href={routes.editor}>
          {unpublished ? TEXT.firstPublish : `${TEXT.edit} ${title.toLowerCase()}`}
        </Link>
        <Link className={styles.link} href={routes.history}>
          {`${TEXT.history} de ${title.toLowerCase()}`}
        </Link>
      </div>
    </article>
  );
}

/** Dashboard: one card per document. Each is read on its own, so one that fails shows its error and the others still show. */
export default async function DashboardPage() {
  const ctx = await pageContext();
  const settled = await Promise.allSettled(KINDS.map((kind) => getAdminContent(kind, ctx)));
  const results = settled.map((entry): AdminResult<AdminContent> => (entry.status === 'fulfilled' ? entry.value : { kind: 'unreachable', requestId: ctx.requestId }));
  for (const result of results) expireOn401(result, '/admin/');
  return (
    <div className={editor.frame}>
      <h1 className={`${editor.title} display`}>{TEXT.title}</h1>
      <p className={editor.intro}>{TEXT.intro}</p>
      <div className={styles.grid}>
        {KINDS.map((kind, i) => (
          <Card key={kind} kind={kind} result={results[i] as AdminResult<AdminContent>} />
        ))}
      </div>
    </div>
  );
}
