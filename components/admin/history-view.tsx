'use client';

import Link from 'next/link';
import { useId, useRef, useState, type ButtonHTMLAttributes } from 'react';
import type { ContentKind, ContentLang, VersionSnapshot, VersionSummary } from '@/lib/api/admin';
import { adminFetch } from '@/lib/admin/browser-client';
import { architectureModel } from '@/lib/admin/content/architecture';
import { diffDocuments } from '@/lib/admin/content/diff';
import { loadDraft, sessionDrafts, type DraftStorage, type StoredDraft } from '@/lib/admin/content/drafts';
import { KIND_ROUTES } from '@/lib/admin/content/kinds';
import { isObj, parseContentView, type ContentView } from '@/lib/admin/content/model';
import { projectsModel } from '@/lib/admin/content/projects';
import { servicesModel } from '@/lib/admin/content/services';
import { historyUrl, shortComment, snapshotItems } from '@/lib/admin/history';
import { expiredLoginUrl } from '@/lib/admin/next-path';
import { adminMessage, CLIENT_FAILURES, UI } from '@/lib/admin/messages';
import { ConfirmDialog } from './confirm-dialog';
import { DocumentDiffList } from './content-diff';
import { LocalTime } from './local-time';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import editor from './editor.module.css';
import styles from './history.module.css';

const T = UI.history;
const KIND_NAMES = UI.dashboard.kinds;
const SOURCES = UI.dashboard.sources;
const LANGS: readonly ContentLang[] = ['es', 'en'];
const LANG_NAMES: Record<ContentLang, string> = { es: 'español', en: 'inglés' };
const SHORT = UI.editor.langShort;

/** What each kind's editor knows that the history reuses: the Spanish names of the fields and the shape of its drafts. */
const MODELS: Record<ContentKind, { fieldLabel: (field: string) => string; isDraft: (value: unknown) => boolean }> = {
  services: servicesModel,
  projects: projectsModel,
  architecture: architectureModel,
};

export type SnapshotState =
  | { kind: 'ok'; data: VersionSnapshot }
  /** `?v=N` names a version that does not exist in this language. */
  | { kind: 'missing'; version: number }
  | { kind: 'failed'; text: string; reference: string };

export interface HistoryViewProps {
  kind: ContentKind;
  lang: ContentLang;
  /** Newest first, as the API lists them (at most `HISTORY_LIMIT`). */
  versions: VersionSummary[];
  /** What is active now in both languages, with its parity. */
  current: ContentView;
  snapshot: SnapshotState | null;
  /** Where unsaved drafts of the editors live; the browser's `sessionStorage` when not given. */
  storage?: DraftStorage | null;
  navigate?: (url: string) => void;
  /** Listing was capped: there may be older versions. */
  capped?: boolean;
}

interface Failure {
  text: string;
  reference?: string | undefined;
  reload?: boolean;
  errors?: Array<{ path: string; code: string }>;
}

const goTo = (url: string) => window.location.assign(url);

function ActiveBadge() {
  return (
    <span className={styles.badge}>
      {/* Said in words; the filled circle only repeats it. */}
      <svg className={styles.icon} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="6" fill="currentColor" />
      </svg>
      {T.active}
    </span>
  );
}

/** Version of `lang` that a 409 says is active now, when the answer carries the latest content. */
function activeIn(latest: unknown, lang: ContentLang): number | null {
  const view = parseContentView(latest);
  return view === null ? null : view.languages[lang].version;
}

const violations = (raw: unknown): Array<{ path: string; code: string }> =>
  Array.isArray(raw) ? raw.filter((entry): entry is { path: string; code: string } => isObj(entry) && typeof entry.path === 'string' && typeof entry.code === 'string') : [];

/**
 * History of one language of a kind: its versions, a read-only snapshot with what restoring it would change, and the rollback. Restoring is
 * always confirmed, sends the active version it saw as `baseVersion` (a 409 when someone published meanwhile) and is never retried. It moves the
 * active pointer of that language only (the API keeps every version) and never touches the drafts the editors keep in `sessionStorage`: the
 * dialog says one exists and the editor offers it afterwards (stale, so it asks before overwriting).
 */
export function HistoryView({ kind, lang, versions, current: initial, snapshot, storage: given, navigate = goTo, capped = false }: HistoryViewProps) {
  const uid = useId();
  const [current, setCurrent] = useState(initial);
  const [pending, setPending] = useState<{ target: number; draft: StoredDraft<unknown> | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const model = MODELS[kind];
  const kindName = KIND_NAMES[kind];
  const editorHref = KIND_ROUTES[kind].editor;
  const other: ContentLang = lang === 'es' ? 'en' : 'es';
  const active = current.languages[lang].version;
  const self = historyUrl(kind, lang, snapshot?.kind === 'ok' ? snapshot.data.version : snapshot?.kind === 'missing' ? snapshot.version : null);

  const ask = (target: number) => {
    if (target === active || sending.current) return;
    const storage = given !== undefined ? given : sessionDrafts();
    const draft = loadDraft(storage, kind, (value): value is unknown => model.isDraft(value));
    setPending({ target, draft });
  };

  async function restore() {
    const request = pending;
    setPending(null);
    if (request === null || sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    setAnnouncement(T.restoring);
    const from = active;
    const result = await adminFetch(`/admin/api/content/${kind}/${lang}/rollback`, { method: 'POST', json: { baseVersion: from, targetVersion: request.target } });
    sending.current = false;
    setBusy(false);
    setAnnouncement('');
    if (result.kind === 'expired') {
      navigate(expiredLoginUrl(self));
      return;
    }
    if (result.kind === 'ok') {
      const next = parseContentView(result.data);
      if (next === null) {
        setFailure({ text: `${adminMessage('ADMIN_BAD_RESPONSE')}${T.notRetried}`, reload: true });
        return;
      }
      setCurrent(next);
      const done = T.done(LANG_NAMES[lang], next.languages[lang].version, from, SHORT[other] as string);
      setAnnouncement(`${done}${request.draft ? T.draftKept : ''}`);
      return;
    }
    if (result.kind !== 'problem') {
      setFailure({ text: `${CLIENT_FAILURES[result.kind]}${T.notRetried}`, reload: true });
      return;
    }
    const reference = result.requestId;
    if (result.status === 409) setFailure({ text: T.conflict(LANG_NAMES[lang], activeIn(result.latest, lang)), reference, reload: true });
    else if (result.status === 404 && result.code === 'CONTENT_VERSION_NOT_FOUND') setFailure({ text: T.notFound(request.target, from), reference });
    else if (result.status === 422) {
      const errors = violations(result.errors);
      setFailure({ text: T.invalid(request.target, from, errors.length), reference, errors });
    } else setFailure({ text: adminMessage(result.code), reference });
  }

  /** «Restaurar» stays focusable when it cannot act (the active version, or a rollback on its way): inert, never `disabled`. */
  const restoreProps: RestoreProps = (target) => ({
    type: 'button',
    className: `${form.secondary} ${styles.action}`,
    onClick: () => ask(target),
    ...(target === active || busy ? { 'aria-disabled': true } : {}),
    ...(target === active ? { 'aria-describedby': `${uid}-active-hint` } : {}),
  });

  const listTitle = T.listTitle(LANG_NAMES[lang]);
  const draftWhen = pending?.draft ? new Date(pending.draft.savedAt).toLocaleString('es-ES') : '';

  return (
    <>
      <nav aria-label={T.langs}>
        <ul className={styles.langs}>
          {LANGS.map((code) => (
            <li key={code}>
              <Link className={styles.lang} href={historyUrl(kind, code)} {...(code === lang ? { 'aria-current': 'page' as const } : {})}>
                {UI.editor.langs[code]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p>
        {T.activeNow(current.languages.es.version, current.languages.en.version)}{' '}
        <Link href={editorHref}>{T.editor(kindName)}</Link>
      </p>
      <p id={`${uid}-active-hint`} hidden>
        {T.activeHint}
      </p>
      <p role="status" className={form.status}>
        {announcement}
      </p>

      {failure ? (
        <div>
          <StatusBanner tone="error" role="alert" reference={failure.reference}>
            {failure.text}
            {failure.errors && failure.errors.length > 0 ? (
              <ul className={styles.errors}>
                {failure.errors.map((entry) => (
                  <li key={`${entry.path}:${entry.code}`}>{`${entry.path.replace(/^(es|en)\./, '')}: ${adminMessage(entry.code)}`}</li>
                ))}
              </ul>
            ) : null}
          </StatusBanner>
          {failure.reload ? (
            <button type="button" className={form.button} onClick={() => navigate(self)}>
              {T.reload}
            </button>
          ) : null}
        </div>
      ) : null}

      {!current.parity.ok && current !== initial ? (
        <StatusBanner tone="info">
          {T.parityBroken(current.parity.differences.length)} <Link href={editorHref}>{T.parityLink}</Link>
        </StatusBanner>
      ) : null}

      {snapshot ? <Snapshot kind={kind} lang={lang} state={snapshot} current={current} restore={restoreProps} /> : null}

      <section aria-labelledby={`${uid}-list`}>
        <h2 id={`${uid}-list`} className={editor.panelTitle}>
          {listTitle}
        </h2>
        {versions.length === 0 ? (
          <p className={editor.empty}>
            {T.never(LANG_NAMES[lang])}{' '}
            <Link href={editorHref}>{T.firstPublish}</Link>
          </p>
        ) : (
          <>
            {versions.length === 1 ? <p>{T.onlyOne}</p> : null}
            {capped ? <p>{T.capped(versions.length)}</p> : null}
            <ol className={styles.rows} aria-labelledby={`${uid}-list`}>
              {versions.map((version) => {
                const isActive = version.version === active;
                const numberId = `${uid}-v${version.version}`;
                const comment = version.comment ? shortComment(version.comment) : null;
                return (
                  <li key={version.version} className={styles.row} aria-labelledby={numberId} data-active={isActive ? 'true' : 'false'}>
                    <p className={styles.head}>
                      <span id={numberId} className={`${styles.number} mono`}>
                        {T.version(version.version)}
                      </span>
                      {isActive ? <ActiveBadge /> : null}
                    </p>
                    <dl className={styles.facts}>
                      <dt>{T.published}</dt>
                      <dd>
                        <LocalTime value={version.publishedAt} />
                      </dd>
                      <dt>{T.source}</dt>
                      <dd>{SOURCES[version.source] ?? UI.dashboard.unknownSource}</dd>
                      <dt>{T.comment}</dt>
                      <dd>{comment === null ? T.noComment : comment.truncated ? <span title={version.comment ?? ''}>{comment.text}</span> : comment.text}</dd>
                    </dl>
                    <div className={styles.actions}>
                      <Link className={`${form.secondary} ${styles.action}`} href={historyUrl(kind, lang, version.version)}>
                        {T.view(version.version, SHORT[lang] as string)}
                      </Link>
                      <button {...restoreProps(version.version)}>{T.restore(version.version, SHORT[lang] as string)}</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={T.confirm.title}
        description={
          pending
            ? `${T.confirm.text(SHORT[lang] as string, active, pending.target, SHORT[other] as string, current.languages[other].version)}${pending.draft ? T.confirm.draft(kindName, draftWhen) : ''}`
            : ''
        }
        confirmLabel={T.confirm.action}
        onConfirm={() => void restore()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

type RestoreProps = (target: number) => ButtonHTMLAttributes<HTMLButtonElement>;

/** One version, read only: its facts, what restoring it would change against the active one, its items and the whole document. */
function Snapshot({ kind, lang, state, current, restore }: { kind: ContentKind; lang: ContentLang; state: SnapshotState; current: ContentView; restore: RestoreProps }) {
  const uid = useId();
  if (state.kind === 'missing') {
    return (
      <StatusBanner tone="error" role="alert">
        {T.snapshot.missing(state.version, LANG_NAMES[lang])}
      </StatusBanner>
    );
  }
  if (state.kind === 'failed') {
    return (
      <StatusBanner tone="error" role="alert" reference={state.reference}>
        {`${T.snapshot.failed} ${state.text}`}
      </StatusBanner>
    );
  }
  const { data } = state;
  const activeNow = current.languages[lang];
  const isActive = data.version === activeNow.version;
  const items = snapshotItems(kind, data.content);
  const title = T.snapshot.title(data.version, UI.editor.langs[lang] as string);
  return (
    <section className={styles.snapshot} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={editor.panelTitle}>
        {title}
      </h2>
      <p>{T.snapshot.readOnly}</p>
      <dl className={styles.facts}>
        {data.publishedAt ? (
          <>
            <dt>{T.published}</dt>
            <dd>
              <LocalTime value={data.publishedAt} />
            </dd>
          </>
        ) : null}
        {data.source ? (
          <>
            <dt>{T.source}</dt>
            <dd>{SOURCES[data.source] ?? UI.dashboard.unknownSource}</dd>
          </>
        ) : null}
        <dt>{T.comment}</dt>
        <dd>{data.comment ?? T.noComment}</dd>
      </dl>
      {isActive ? (
        <p>
          <ActiveBadge /> {T.snapshot.isActive}
        </p>
      ) : activeNow.version === 0 ? (
        <p>{T.snapshot.noActive}</p>
      ) : (
        <div>
          <p>{T.snapshot.changes(activeNow.version)}</p>
          <DocumentDiffList side={diffDocuments(kind, activeNow.content, data.content)} label={MODELS[kind].fieldLabel} />
        </div>
      )}
      <h3 id={`${uid}-items`}>{T.snapshot.items}</h3>
      {items.length === 0 ? (
        <p>{T.snapshot.empty}</p>
      ) : (
        <ul className={styles.items} aria-labelledby={`${uid}-items`}>
          {items.map((item, i) => (
            <li key={`${item.id}-${i}`}>
              <span className="mono">{item.id}</span>
              {item.label ? ` — ${item.label}` : ''}
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>{T.snapshot.document}</summary>
        <pre className={`${styles.document} mono`}>{JSON.stringify(data.content, null, 2)}</pre>
      </details>
      <div className={styles.actions}>
        <button {...restore(data.version)}>{T.snapshot.restore}</button>
        <Link className={`${form.secondary} ${styles.action}`} href={historyUrl(kind, lang)}>
          {T.snapshot.back}
        </Link>
      </div>
    </section>
  );
}
