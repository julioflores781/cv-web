'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ContentLang, ViolationEntry } from '@/lib/api/admin';
import { adminFetch } from '@/lib/admin/browser-client';
import { canonical, countChanges, diffContent } from '@/lib/admin/content/diff';
import { clearDraft, loadDraft, saveDraft, sessionDrafts, type DraftStorage } from '@/lib/admin/content/drafts';
import { markSaved, parseContentView, removePair, updatePair, versionsOf, type ContentView, type Documents, type EditorModel, type PairedDraft } from '@/lib/admin/content/model';
import { COMMENT_FIELD_ID, dropFields, EMPTY_ERRORS, isBelow, mapViolations, type ErrorMap } from '@/lib/admin/content/paths';
import { fitsSave } from '@/lib/admin/content/size';
import { javaStrip } from '@/lib/admin/content/java-text';
import { codePoints, compareParity, MAX_COMMENT, validateSave, type SaveCandidate } from '@/lib/admin/content/validate';
import { adminMessage, CLIENT_FAILURES, UI } from '@/lib/admin/messages';
import { expiredLoginUrl } from '@/lib/admin/next-path';
import { ConfirmDialog } from './confirm-dialog';
import { ContentDiffList } from './content-diff';
import { ErrorSummary, type SummaryEntry } from './error-summary';
import { FieldError } from './paired-field';
import { ParityPanel, type UnpairedItem } from './parity-panel';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import styles from './editor.module.css';

export interface EditorContext<D extends PairedDraft> {
  draft: D;
  /**
   * Applies a change; `fieldId` is the field being edited, whose server error goes away. `reordered` names lists whose rows moved or went away:
   * the server marks of their rows were placed by position, so they are taken off rather than left on the wrong row (the data stays).
   */
  update: (change: (draft: D) => D, fieldId?: string, reordered?: readonly string[]) => void;
  errors: ErrorMap;
  /** Changes after every failed save (items with errors open). */
  reveal: number;
  /** The session died outside a save (an upload): keeps the draft and goes to the login, like a 401 on saving. */
  expire: () => void;
}

interface EditorFrameProps<D extends PairedDraft> {
  model: EditorModel<D>;
  /** The content as `GET /admin/api/content/{kind}/` gave it (rendered by the server page). */
  initial: ContentView;
  /** This page, to come back to after a re-login. */
  path: string;
  navigate?: (url: string) => void;
  /** Where drafts go; the browser's `sessionStorage` when not given. */
  storage?: DraftStorage | null;
  /** The client mirror of the API rules (replaceable in tests to reach the server's 422). */
  validate?: (kind: EditorModel<D>['kind'], candidate: SaveCandidate) => ViolationEntry[];
  children: (context: EditorContext<D>) => ReactNode;
}

interface Base {
  versions: Record<ContentLang, number>;
  /** Published documents in the editor's normal form (what `serialize` gives for them), to count changes and diff. */
  docs: Documents;
  parity: ViolationEntry[];
}

interface Conflict {
  latest: ContentView | null;
  /** Versions the refused save was based on. */
  sent: Record<ContentLang, number>;
  langs: ContentLang[];
}

type Failure = { text: string; reference?: string | undefined };

const LANGS: readonly ContentLang[] = ['es', 'en'];
const AUTOSAVE_MS = 400;
const goTo = (url: string): void => window.location.assign(url);
const subscribeNothing = () => () => undefined;

function start<D extends PairedDraft>(model: EditorModel<D>, view: ContentView): { base: Base; draft: D } {
  const draft = model.pair(view.languages.es.content, view.languages.en.content);
  return { base: { versions: versionsOf(view), docs: model.serialize(draft), parity: view.parity.differences }, draft };
}

const same = (a: Documents, b: Documents): boolean => canonical(a) === canonical(b);

/**
 * Frame of every content editor: the save bar (state, comment, «Guardar»), the client validation and its summary, the 409 banner (see what
 * changed, overwrite or discard, both confirmed; the draft is never lost), the 422 mapping, network errors with retry, the draft kept in
 * `sessionStorage` (offered back after a 401 or a reload) and the ES/EN parity panel. The form itself is the `children` render prop.
 */
export function EditorFrame<D extends PairedDraft>({ model, initial, path, navigate = goTo, storage: given, validate = validateSave, children }: EditorFrameProps<D>) {
  const { kind } = model;
  const [first] = useState(() => start(model, initial));
  const [base, setBase] = useState<Base>(first.base);
  const [draft, setDraft] = useState<D>(first.draft);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<ContentLang, number> | null>(null);
  const [errors, setErrors] = useState<ErrorMap>(EMPTY_ERRORS);
  const [errorSource, setErrorSource] = useState<'client' | 'server' | null>(null);
  const [failingPaths, setFailingPaths] = useState<ReadonlySet<string>>(new Set());
  const [tooLarge, setTooLarge] = useState(false);
  const [parityBroken, setParityBroken] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [confirming, setConfirming] = useState<'overwrite' | 'discard' | null>(null);
  const [offerClosed, setOfferClosed] = useState(false);
  // Versions a restored draft was based on, when they are older than the published ones: the save sends them, so the API answers 409 and the
  // usual conflict flow (diff, confirmed overwrite, discard) decides. A restored draft never overwrites a newer version silently.
  const [draftBase, setDraftBase] = useState<Record<ContentLang, number> | null>(null);
  const unloadGuard = useRef<((event: BeforeUnloadEvent) => void) | null>(null);
  const [restored, setRestored] = useState(false);
  const sending = useRef(false);
  const summary = useRef<HTMLDivElement>(null);
  const focusSummary = useRef(false);

  const storage = useMemo(() => (given !== undefined ? given : sessionDrafts()), [given]);
  const docs = useMemo(() => model.serialize(draft), [model, draft]);
  const changes = useMemo(() => countChanges(diffContent(kind, base.docs, docs)), [kind, base.docs, docs]);
  const dirty = changes > 0;
  const saveBase = draftBase ?? base.versions;

  // A draft left by an earlier visit (a 401, a 409, a reload) is offered once, unless it is what is published. It is read after hydration only.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const stored = useMemo(() => (hydrated ? loadDraft(storage, kind, model.isDraft) : null), [hydrated, storage, kind, model]);
  const pristine =
    stored !== null &&
    stored.baseVersions.es === first.base.versions.es &&
    stored.baseVersions.en === first.base.versions.en &&
    same(model.serialize(stored.draft), first.base.docs);
  const offer = stored !== null && !pristine && !offerClosed ? stored : null;
  useEffect(() => {
    if (pristine) clearDraft(storage, kind);
  }, [pristine, storage, kind]);

  // Unsaved work is copied to sessionStorage shortly after each change.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => saveDraft(storage, kind, saveBase, draft), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, storage, kind, saveBase, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    unloadGuard.current = warn;
    return () => {
      window.removeEventListener('beforeunload', warn);
      unloadGuard.current = null;
    };
  }, [dirty]);

  useEffect(() => {
    if (!focusSummary.current) return;
    focusSummary.current = false;
    summary.current?.focus();
  });

  const showErrors = useCallback(
    (violations: readonly ViolationEntry[], source: 'client' | 'server', current: D) => {
      setErrors(mapViolations(model, current, violations));
      setErrorSource(source);
      setFailingPaths(new Set(violations.map((violation) => violation.path)));
      setReveal((value) => value + 1);
      focusSummary.current = true;
    },
    [model],
  );

  const clearErrors = () => {
    setErrors(EMPTY_ERRORS);
    setErrorSource(null);
    setTooLarge(false);
    setParityBroken(false);
  };

  const update = (change: (current: D) => D, fieldId?: string, reordered: readonly string[] = []) => {
    const next = change(draft);
    setSaved(null);
    setDraft(next);
    if (errorSource === 'client') {
      // Client errors are checked again on every change, keeping only the ones of the failed save: fixing a field clears it.
      const remaining = validate(kind, { comment, documents: model.serialize(next) }).filter((violation) => failingPaths.has(violation.path));
      setErrors(mapViolations(model, next, remaining));
    } else if (errorSource === 'server') {
      const below = isBelow(reordered);
      const drop = (id: string) => id === fieldId || below(id);
      if (Object.keys(errors.fields).some(drop)) setErrors(dropFields(errors, drop));
    }
  };

  /** Keeps the draft and leaves for the login. The draft is safe in sessionStorage: no «leave the site?» prompt on top of the redirect. */
  function leaveExpired() {
    saveDraft(storage, kind, saveBase, draft);
    if (unloadGuard.current) window.removeEventListener('beforeunload', unloadGuard.current);
    unloadGuard.current = null;
    navigate(expiredLoginUrl(path));
  }

  // A 401 outside a save (an upload) is reported through the context; the redirect happens right after that render.
  const [expired, setExpired] = useState(false);
  const left = useRef(false);
  useEffect(() => {
    if (!expired || left.current) return;
    left.current = true;
    leaveExpired();
  });
  const expire = useCallback(() => setExpired(true), []);

  async function save(versions: Record<ContentLang, number>) {
    if (sending.current) return;
    setFailure(null);
    setSaved(null);
    const candidate = { comment, documents: docs };
    const violations = validate(kind, candidate);
    const stripped = javaStrip(comment);
    const body = { baseVersions: versions, ...(stripped ? { comment: stripped } : {}), documents: docs };
    const large = !fitsSave(body);
    if (violations.length > 0 || large) {
      clearErrors();
      setTooLarge(large);
      showErrors(violations, 'client', draft);
      return;
    }
    clearErrors();
    sending.current = true;
    setSaving(true);
    const result = await adminFetch('/admin/api/content/' + kind, { method: 'PUT', json: body, timeoutMs: 20_000 });
    sending.current = false;
    setSaving(false);

    if (result.kind === 'ok') {
      const view = parseContentView(result.data);
      if (view === null) {
        setFailure({ text: adminMessage('ADMIN_BAD_RESPONSE') });
        return;
      }
      const next = model.markSaved ? model.markSaved(draft) : markSaved(draft);
      setDraft(next);
      setDraftBase(null);
      setBase({ versions: versionsOf(view), docs: model.serialize(model.pair(view.languages.es.content, view.languages.en.content)), parity: view.parity.differences });
      setConflict(null);
      setShowDiff(false);
      setComment('');
      setSaved(versionsOf(view));
      clearDraft(storage, kind);
      return;
    }
    if (result.kind === 'expired') {
      leaveExpired();
      return;
    }
    if (result.kind === 'problem') {
      if (result.status === 409 && result.code === 'CONTENT_VERSION_CONFLICT') {
        saveDraft(storage, kind, saveBase, draft);
        const latest = parseContentView(result.latest);
        setConflict({ latest, sent: versions, langs: latest === null ? [] : LANGS.filter((lang) => latest.languages[lang].version !== versions[lang]) });
        setShowDiff(false);
        return;
      }
      if (result.status === 422 && Array.isArray(result.errors)) {
        const entries = result.errors.filter(
          (entry): entry is ViolationEntry => typeof entry === 'object' && entry !== null && typeof entry.path === 'string' && typeof entry.code === 'string',
        );
        setParityBroken(result.code === 'CONTENT_PARITY_BROKEN');
        showErrors(entries, 'server', draft);
        return;
      }
      setFailure({ text: adminMessage(result.code), reference: result.requestId });
      return;
    }
    setFailure({ text: CLIENT_FAILURES[result.kind] });
  }

  const reset = (view: ContentView) => {
    const next = start(model, view);
    setBase(next.base);
    setDraft(next.draft);
    setDraftBase(null);
    setConflict(null);
    setShowDiff(false);
    clearErrors();
    clearDraft(storage, kind);
  };

  const onConfirm = () => {
    const action = confirming;
    setConfirming(null);
    const latest = conflict?.latest;
    if (!latest) return;
    if (action === 'overwrite') void save(versionsOf(latest));
    if (action === 'discard') reset(latest);
  };

  const restore = () => {
    if (!offer) return;
    setDraft(offer.draft);
    if (offer.baseVersions.es !== base.versions.es || offer.baseVersions.en !== base.versions.en) setDraftBase(offer.baseVersions);
    setOfferClosed(true);
    setRestored(true);
  };

  const dropOffer = () => {
    clearDraft(storage, kind);
    setOfferClosed(true);
  };

  const indexOf = (key: string) => draft.items.findIndex((pair) => pair.key === key);
  const summaryEntries: SummaryEntry[] = errors.entries.map((entry, i) => {
    const location = entry.location;
    if (location?.itemKey === null && location.field === 'comment') return { id: `${i}`, where: UI.editor.fields.comment, code: entry.code, fieldId: entry.fieldId };
    if (location?.itemKey === null) {
      const scope = location.scope === 'common' ? UI.editor.common : (UI.editor.langShort[location.scope] ?? location.scope);
      return { id: `${i}`, where: `${model.fieldLabel(location.field)} (${scope})`, code: entry.code, fieldId: entry.fieldId };
    }
    if (location && location.itemKey) {
      const index = indexOf(location.itemKey);
      const pair = draft.items[index];
      const item = pair ? model.itemLabel(pair, index) : '';
      const scope = location.scope === 'common' ? UI.editor.common : (UI.editor.langShort[location.scope] ?? location.scope);
      const where = location.field ? `${item} · ${model.fieldLabel(location.field)} (${scope})` : item;
      return { id: `${i}`, where, code: entry.code, fieldId: entry.fieldId };
    }
    return { id: `${i}`, where: UI.editor.generalScope, code: entry.code, fieldId: null, path: entry.path };
  });
  const hasSummary = summaryEntries.length > 0 || tooLarge;

  const unpaired: UnpairedItem[] = draft.items.flatMap((pair, index) =>
    pair.es === null || pair.en === null ? [{ key: pair.key, label: model.itemLabel(pair, index), missing: pair.es === null ? ('es' as const) : ('en' as const) }] : [],
  );
  const localParity = useMemo(() => compareParity(kind, docs.es, docs.en), [kind, docs]);
  const fixes = (model.fixes?.(draft) ?? []).map((fix) => ({ key: fix.key, label: fix.label, text: fix.text, onFix: () => update(fix.apply) }));

  const commentLength = codePoints(javaStrip(comment));
  const commentError = commentLength > MAX_COMMENT ? 'TOO_LONG' : errors.fields[COMMENT_FIELD_ID];
  const blocked = !dirty || saving;
  const state = saving ? UI.editor.saving : dirty ? UI.editor.changes(changes) : saved ? UI.editor.saved(saved.es, saved.en) : UI.editor.noChanges;
  const offerStale = offer !== null && (offer.baseVersions.es !== base.versions.es || offer.baseVersions.en !== base.versions.en);

  return (
    <div className={styles.frame}>
      {offer ? (
        <StatusBanner tone="info" role="status">
          {UI.editor.draft.found(new Date(offer.savedAt).toLocaleString('es-ES'))}
          {offerStale ? ` ${UI.editor.draft.stale}` : ''}
        </StatusBanner>
      ) : null}
      {offer && offerStale ? <ContentDiffList diff={diffContent(kind, base.docs, model.serialize(offer.draft))} label={model.fieldLabel} /> : null}
      {offer ? (
        <div className={styles.actions}>
          <button type="button" className={form.button} onClick={restore}>
            {UI.editor.draft.restore}
          </button>
          <button type="button" className={form.secondary} onClick={dropOffer}>
            {UI.editor.draft.discard}
          </button>
        </div>
      ) : null}

      {conflict ? (
        <div className={styles.panel} role="alert">
          <StatusBanner tone="error">
            {UI.editor.conflict.title}{' '}
            {conflict.latest
              ? UI.editor.conflict.langs(
                  conflict.langs.map((lang) => `${UI.editor.langShort[lang]} (v${conflict.sent[lang]} → v${conflict.latest?.languages[lang].version})`).join(', ') || UI.editor.langShort.es + '/' + UI.editor.langShort.en,
                )
              : UI.editor.conflict.noLatest}
          </StatusBanner>
          {conflict.latest ? (
            <div className={styles.actions}>
              <button type="button" className={form.secondary} aria-expanded={showDiff} onClick={() => setShowDiff(!showDiff)}>
                {showDiff ? UI.editor.conflict.hide : UI.editor.conflict.show}
              </button>
              <button type="button" className={form.button} onClick={() => setConfirming('overwrite')}>
                {UI.editor.conflict.overwrite}
              </button>
              <button type="button" className={form.secondary} onClick={() => setConfirming('discard')}>
                {UI.editor.conflict.discard}
              </button>
            </div>
          ) : null}
          {conflict.latest && showDiff ? (
            <>
              <p>{UI.editor.conflict.diffIntro}</p>
              <ContentDiffList diff={diffContent(kind, model.serialize(model.pair(conflict.latest.languages.es.content, conflict.latest.languages.en.content)), docs)} label={model.fieldLabel} />
            </>
          ) : null}
        </div>
      ) : null}

      {parityBroken ? <StatusBanner tone="error">{UI.editor.parityBanner}</StatusBanner> : null}
      {hasSummary ? <ErrorSummary ref={summary} entries={summaryEntries} extra={tooLarge ? UI.editor.tooLarge : null} /> : null}
      {failure ? (
        <div className={styles.panel} role="alert">
          <StatusBanner tone="error" reference={failure.reference}>
            {failure.text}
          </StatusBanner>
          <div>
            <button type="button" className={form.secondary} onClick={() => void save(saveBase)}>
              {UI.editor.retry}
            </button>
          </div>
        </div>
      ) : null}

      <ParityPanel
        local={localParity}
        published={base.parity}
        unpaired={unpaired}
        fixes={fixes}
        onTwin={(key, lang) => update((current) => ({ ...current, items: updatePair(current.items, key, (pair) => model.twin(pair, lang)) }))}
        onRemove={(key) => update((current) => ({ ...current, items: removePair(current.items, key) }))}
      />

      {children({ draft, update, errors, reveal, expire })}

      <div className={styles.saveBar}>
        <div className={`${styles.field} ${styles.comment}`}>
          <label className={styles.legend} htmlFor={COMMENT_FIELD_ID}>
            {UI.editor.fields.comment}
          </label>
          <input
            id={COMMENT_FIELD_ID}
            className={styles.input}
            type="text"
            autoComplete="off"
            value={comment}
            aria-invalid={commentError ? true : undefined}
            aria-describedby={`${COMMENT_FIELD_ID}-hint ${COMMENT_FIELD_ID}-count${commentError ? ` ${COMMENT_FIELD_ID}-error` : ''}`}
            onChange={(event) => setComment(event.target.value)}
          />
          <span className={styles.meta}>
            <span id={`${COMMENT_FIELD_ID}-hint`}>{UI.editor.commentHint}</span>
            <span id={`${COMMENT_FIELD_ID}-count`}>{UI.editor.counter(commentLength, MAX_COMMENT)}</span>
          </span>
          {commentError ? <FieldError id={`${COMMENT_FIELD_ID}-error`} code={commentError} /> : null}
        </div>
        <p className={styles.state} aria-live="off">
          {state}
        </p>
        <button type="button" className={form.button} aria-disabled={blocked ? true : undefined} onClick={() => (blocked ? undefined : void save(saveBase))}>
          {saving ? UI.editor.saving : UI.editor.save}
        </button>
        <p role="status" className={styles.visuallyHidden}>
          {saving ? UI.editor.saving : saved ? UI.editor.saved(saved.es, saved.en) : restored ? UI.editor.draft.restored : ''}
        </p>
      </div>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'discard' ? UI.editor.conflict.discardTitle : UI.editor.conflict.overwriteTitle}
        description={confirming === 'discard' ? UI.editor.conflict.discardText : UI.editor.conflict.overwriteText}
        confirmLabel={confirming === 'discard' ? UI.editor.conflict.discard : UI.editor.conflict.overwrite}
        onCancel={() => setConfirming(null)}
        onConfirm={onConfirm}
      />
    </div>
  );
}
