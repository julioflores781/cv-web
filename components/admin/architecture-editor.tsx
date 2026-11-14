'use client';

import { useEffect, useRef, useState } from 'react';
import type { ContentLang, ViolationEntry } from '@/lib/api/admin';
import {
  ADAPTER_STATUSES,
  adapterLabel,
  architectureModel,
  isAdapterStatus,
  newAdapter,
  newPort,
  statusLabel,
  statusOf,
  toArchitecture,
  twinAdapter,
  withStatus,
  type AdapterPair,
  type ArchitectureDraft,
  type PortPair,
} from '@/lib/admin/content/architecture';
import type { DraftStorage } from '@/lib/admin/content/drafts';
import { addPair, movePair, removePair, updatePair, type ContentView } from '@/lib/admin/content/model';
import { fieldId } from '@/lib/admin/content/paths';
import { suggestId } from '@/lib/admin/content/slug';
import { LIMITS, type SaveCandidate } from '@/lib/admin/content/validate';
import { UI } from '@/lib/admin/messages';
import { buildHexModel } from '@/lib/architecture/model';
import { MAX_RADIAL } from '@/lib/architecture/slots';
import { StatusShape } from '../ui/status-shape';
import { EditorFrame, type EditorContext } from './editor-frame';
import { HexPreview } from './hex-preview';
import { ItemList } from './item-list';
import { useFocusLater } from './use-focus-later';
import { FieldError, PairedFields, SelectField, TextField } from './paired-field';
import form from './form.module.css';
import editor from './editor.module.css';
import rows from './projects.module.css';
import styles from './architecture.module.css';

interface ArchitectureEditorProps {
  initial: ContentView;
  path?: string;
  navigate?: (url: string) => void;
  storage?: DraftStorage | null;
  validate?: (kind: 'services' | 'projects' | 'architecture', candidate: SaveCandidate) => ViolationEntry[];
}

type Scope = 'common' | ContentLang;
type Context = EditorContext<ArchitectureDraft>;

const LANGS: readonly ContentLang[] = ['es', 'en'];
const TEXT = UI.architecture;
const F = TEXT.fields;
const SCOPES = UI.projects.scopes;
const langName = (lang: ContentLang): string => UI.editor.langs[lang]?.toLowerCase() ?? lang;

const statusOptions = (current: string) => [
  ...(isAdapterStatus(current) ? [] : [{ value: current, label: TEXT.unknownStatus(current || '—') }]),
  ...ADAPTER_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
];

/** A port is drawn in a language when it has a name and at least one adapter with a name and a valid status (what `buildHexModel` keeps). */
const drawnIn = (port: PortPair, lang: ContentLang): boolean =>
  (port[lang]?.name.trim() ?? '') !== '' && port.common.adapters.some((adapter) => (adapter[lang]?.name.trim() ?? '') !== '' && isAdapterStatus(statusOf(adapter, lang)));

function CoreBlock({ context }: { context: Context }) {
  const { draft, update, errors } = context;
  return (
    <section className={editor.panel} aria-labelledby="nucleo-titulo">
      <h2 id="nucleo-titulo" className={editor.panelTitle}>
        {TEXT.core}
      </h2>
      <div className={editor.columns}>
        {LANGS.map((lang) => {
          const groupId = fieldId({ itemKey: null, scope: lang, field: 'core' });
          const groupError = errors.fields[groupId];
          const ctx = `nucleo-ctx-${lang}`;
          const id = (field: 'name' | 'description') => fieldId({ itemKey: null, scope: lang, field: `core.${field}` });
          const set = (field: 'name' | 'description', value: string) =>
            update((current) => ({ ...current, core: { ...current.core, [lang]: { ...current.core[lang], [field]: value } } }), id(field));
          return (
            <fieldset
              key={lang}
              id={groupId}
              tabIndex={-1}
              lang={lang}
              className={`${editor.block} ${styles.core}`}
              data-invalid={groupError ? 'true' : undefined}
              aria-describedby={groupError ? `${groupId}-error` : undefined}
            >
              <legend className={editor.legend} lang="es">
                {UI.editor.langs[lang]}
              </legend>
              <span id={ctx} hidden>
                {TEXT.coreContext(SCOPES[lang] ?? lang)}
              </span>
              {groupError ? <FieldError id={`${groupId}-error`} code={groupError} /> : null}
              <TextField id={id('name')} label={F.coreName} value={draft.core[lang].name} max={80} error={errors.fields[id('name')]} labelledBy={ctx} onChange={(value) => set('name', value)} />
              <TextField
                id={id('description')}
                label={F.coreDescription}
                value={draft.core[lang].description}
                max={300}
                multiline
                error={errors.fields[id('description')]}
                labelledBy={ctx}
                onChange={(value) => set('description', value)}
              />
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}

/** The three statuses once, each with its shape and its text (never colour alone). */
function StatusLegend() {
  return (
    <ul className={styles.legend} aria-label={TEXT.statusLegend}>
      {ADAPTER_STATUSES.map((status) => (
        <li key={status} className={styles.statusView}>
          <StatusShape status={status} />
          <span>{statusLabel(status)}</span>
        </li>
      ))}
    </ul>
  );
}

interface AdapterListProps {
  port: PortPair;
  context: Context;
  /** DOM id of a field of this port. */
  idOf: (scope: Scope, field: string) => string;
  /** Hidden context element of each scope (appended to the field labels). */
  ctx: (scope: Scope) => string;
  /** Context text appended to the button names. */
  contextOf: (scope: Scope) => string;
  position: number;
  portName: string;
}

/**
 * Adapters of one port: add (focus to the Spanish name of the new one), move up and down (the focus follows, the new position is announced),
 * remove (focus to the next one, or to «add»). Ids and status are common; names and notes per language. The cap disables «add» with a message.
 */
function AdapterList({ port, context, idOf, ctx, contextOf, position, portName }: AdapterListProps) {
  const { update, errors } = context;
  const adapters = port.common.adapters;
  const listId = idOf('common', 'adapters');
  const addId = `${listId}-add`;
  const listError = errors.fields[listId];
  const full = adapters.length >= LIMITS.adapters;
  const focus = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const A = TEXT.adapters;

  useEffect(() => {
    const wanted = focus.current;
    if (wanted === null) return;
    focus.current = null;
    document.getElementById(wanted)?.focus();
  });

  const change = (field: string, transform: (list: AdapterPair[]) => AdapterPair[], reordered: readonly string[] = []) =>
    update(
      (current) => ({ ...current, items: updatePair(current.items, port.key, (item) => ({ ...item, common: { ...item.common, adapters: transform(item.common.adapters) } })) }),
      field,
      reordered,
    );
  /** The adapters' fields in every scope: their ids carry the position, so a move or a removal takes their server marks off. */
  const rowLists = (['common', 'es', 'en'] as const).map((scope) => idOf(scope, 'adapters'));
  const changeOne = (key: string, field: string, apply: (adapter: AdapterPair, siblings: AdapterPair[]) => AdapterPair) =>
    change(field, (list) => list.map((adapter) => (adapter.key === key ? apply(adapter, list.filter((other) => other.key !== key)) : adapter)));

  /** The first field of the adapter at `index`: its Spanish name, or the English one when the port has no Spanish side. */
  const firstField = (index: number) => idOf(port.es !== null ? 'es' : 'en', `adapters.${index}.name`);

  const add = () => {
    if (full) return;
    const fresh = newAdapter();
    // An adapter only gets the languages its port has.
    const adapter: AdapterPair = { ...fresh, es: port.es === null ? null : fresh.es, en: port.en === null ? null : fresh.en };
    change(listId, (list) => [...list, adapter]);
    focus.current = firstField(adapters.length);
  };
  const remove = (index: number) => {
    const key = adapters[index]?.key;
    change(listId, (list) => list.filter((adapter) => adapter.key !== key), rowLists);
    focus.current = adapters.length > 1 ? firstField(Math.min(index, adapters.length - 2)) : addId;
  };
  const move = (index: number, delta: number) => {
    const to = index + delta;
    const adapter = adapters[index];
    if (adapter === undefined || to < 0 || to >= adapters.length) return;
    change(listId, (list) => movePair(list, adapter.key, delta), rowLists);
    focus.current = `${idOf('common', `adapters.${to}`)}-${delta < 0 ? 'up' : 'down'}`;
    setAnnouncement(UI.editor.moved(adapterLabel(adapter, to), to + 1, adapters.length));
  };

  const setName = (adapter: AdapterPair, index: number, lang: ContentLang, value: string) =>
    changeOne(adapter.key, idOf(lang, `adapters.${index}.name`), (item, siblings) => {
      const words = item[lang];
      if (words === null) return item;
      const next: AdapterPair = { ...item, [lang]: { ...words, name: value } };
      // A new adapter gets its id from the Spanish name, unique inside its port, until the id is typed by hand.
      if (!item.saved && lang === 'es') {
        const taken = siblings.map((other) => other.common.id);
        if (item.common.id === '' || item.common.id === suggestId(words.name, taken)) next.common = { ...item.common, id: suggestId(value, taken) };
      }
      return next;
    });

  const side = (adapter: AdapterPair, index: number, lang: ContentLang) => {
    const words = adapter[lang];
    if (port[lang] === null) return null;
    if (words === null) {
      return (
        <div className={editor.missing}>
          <p>{UI.editor.missingSide(langName(lang))}</p>
          <button
            type="button"
            className={form.secondary}
            aria-label={`${UI.editor.parity.twin(UI.editor.langShort[lang] ?? lang)} ${TEXT.adapterContext(index + 1, SCOPES[lang] ?? lang, position, portName)}`}
            onClick={() => {
              changeOne(adapter.key, idOf(lang, `adapters.${index}.name`), (item) => twinAdapter(item, lang));
              focus.current = idOf(lang, `adapters.${index}.name`);
            }}
          >
            {UI.editor.parity.twin(UI.editor.langShort[lang] ?? lang)}
          </button>
        </div>
      );
    }
    const nameId = idOf(lang, `adapters.${index}.name`);
    const noteId = idOf(lang, `adapters.${index}.note`);
    return (
      <>
        <TextField
          id={nameId}
          label={F.adapterName(index + 1)}
          value={words.name}
          max={80}
          {...(words.name.trim() === '' ? { hint: TEXT.notDrawn.adapter } : {})}
          error={errors.fields[nameId]}
          labelledBy={ctx(lang)}
          onChange={(value) => setName(adapter, index, lang, value)}
        />
        <TextField
          id={noteId}
          label={F.note(index + 1)}
          value={words.note}
          max={200}
          error={errors.fields[noteId]}
          labelledBy={ctx(lang)}
          onChange={(value) =>
            changeOne(adapter.key, noteId, (item) => {
              const current = item[lang];
              return current === null ? item : { ...item, [lang]: { ...current, note: value } };
            })
          }
        />
      </>
    );
  };

  return (
    <fieldset id={listId} tabIndex={-1} className={rows.group} data-invalid={listError ? 'true' : undefined} aria-describedby={listError ? `${listId}-error` : undefined}>
      <legend className={editor.legend}>{F.adapters}</legend>
      {listError ? <FieldError id={`${listId}-error`} code={listError} /> : null}
      {adapters.length > 0 ? (
        <ol className={rows.rows}>
          {adapters.map((adapter, index) => {
            const rowId = idOf('common', `adapters.${index}`);
            const rowError = errors.fields[rowId];
            const idId = idOf('common', `adapters.${index}.id`);
            const statusId = idOf('common', `adapters.${index}.status`);
            const name = A.name(index + 1);
            const own = adapter.en?.status ?? null;
            return (
              <li key={adapter.key} id={rowId} tabIndex={-1} className={rows.row} data-adapter={adapter.key} data-invalid={rowError ? 'true' : undefined}>
                <p className={styles.adapterHead}>
                  <strong>{F.adapter(index + 1)}</strong>
                  {/* The select names the status; this repeats it as shape + text for sighted users. */}
                  <span className={styles.statusView} data-status-view aria-hidden="true">
                    {isAdapterStatus(adapter.common.status) ? <StatusShape status={adapter.common.status} /> : null}
                    <span>{statusLabel(adapter.common.status)}</span>
                  </span>
                </p>
                {rowError ? <FieldError id={`${rowId}-error`} code={rowError} /> : null}
                <PairedFields
                  common={
                    <>
                      <TextField
                        id={idId}
                        label={F.adapterId(index + 1)}
                        value={adapter.common.id}
                        readOnly={adapter.saved}
                        hint={adapter.saved ? UI.editor.idLocked : TEXT.idHint}
                        error={errors.fields[idId]}
                        labelledBy={ctx('common')}
                        onChange={(value) => changeOne(adapter.key, idId, (item) => ({ ...item, common: { ...item.common, id: value.toLowerCase() } }))}
                      />
                      <SelectField
                        id={statusId}
                        label={F.status(index + 1)}
                        value={adapter.common.status}
                        options={statusOptions(adapter.common.status)}
                        error={errors.fields[statusId]}
                        labelledBy={ctx('common')}
                        onChange={(value) => changeOne(adapter.key, statusId, (item) => withStatus(item, value))}
                      />
                      {own !== null && own !== adapter.common.status ? <p className={rows.note}>{TEXT.enStatus(statusLabel(own))}</p> : null}
                    </>
                  }
                  es={side(adapter, index, 'es')}
                  en={side(adapter, index, 'en')}
                />
                <div className={rows.rowTools}>
                  <button
                    type="button"
                    id={`${rowId}-up`}
                    className={rows.rowTool}
                    aria-label={`${A.up(name)} ${contextOf('common')}`}
                    aria-disabled={index === 0 ? true : undefined}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    id={`${rowId}-down`}
                    className={rows.rowTool}
                    aria-label={`${A.down(name)} ${contextOf('common')}`}
                    aria-disabled={index === adapters.length - 1 ? true : undefined}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button type="button" className={rows.rowTool} aria-label={`${A.remove(name)} ${contextOf('common')}`} onClick={() => remove(index)}>
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <div className={editor.actions}>
        <button
          type="button"
          id={addId}
          className={form.secondary}
          aria-label={`${A.add} ${contextOf('common')}`}
          aria-disabled={full ? true : undefined}
          aria-describedby={full ? `${listId}-limit` : undefined}
          onClick={add}
        >
          {A.add}
        </button>
      </div>
      {full ? (
        <p id={`${listId}-limit`} className={rows.note}>
          {A.full(LIMITS.adapters)}
        </p>
      ) : null}
      <p role="status" className={editor.visuallyHidden}>
        {announcement}
      </p>
    </fieldset>
  );
}

function PortFields({ pair, index, context }: { pair: PortPair; index: number; context: Context }) {
  const { draft, update, errors } = context;
  const focusLater = useFocusLater();
  const id = (scope: Scope, field: string) => fieldId({ itemKey: pair.key, scope, field });
  const error = (scope: Scope, field: string) => errors.fields[id(scope, field)];
  const ctx = (scope: Scope) => `${pair.key}-ctx-${scope}`;
  const name = pair.es?.name.trim() || pair.en?.name.trim() || pair.common.id;
  /** Always the position, so equal names never give equal accessible names. */
  const contextOf = (scope: Scope) => TEXT.context(SCOPES[scope] ?? scope, index + 1, name);
  const change = (field: string, scope: Scope, apply: (pair: PortPair) => PortPair) =>
    update((current) => ({ ...current, items: updatePair(current.items, pair.key, apply) }), id(scope, field));

  const setText = (lang: ContentLang, key: 'name' | 'description', value: string) =>
    change(key, lang, (item) => {
      const words = item[lang];
      if (words === null) return item;
      const next: PortPair = { ...item, [lang]: { ...words, [key]: value } };
      // A new port gets its id from the Spanish name until the id is typed by hand.
      if (!item.saved && lang === 'es' && key === 'name') {
        const taken = draft.items.filter((other) => other.key !== item.key).map((other) => other.common.id);
        if (item.common.id === '' || item.common.id === suggestId(words.name, taken)) next.common = { ...item.common, id: suggestId(value, taken) };
      }
      return next;
    });

  const noAdapters = pair.common.adapters.length === 0;
  const common = (
    <>
      <TextField
        id={id('common', 'id')}
        label={UI.editor.fields.id}
        value={pair.common.id}
        readOnly={pair.saved}
        hint={pair.saved ? UI.editor.idLocked : TEXT.idHint}
        error={error('common', 'id')}
        labelledBy={ctx('common')}
        onChange={(value) => change('id', 'common', (item) => ({ ...item, common: { ...item.common, id: value.toLowerCase() } }))}
      />
      {noAdapters ? <p className={rows.note}>{TEXT.notDrawn.port}</p> : null}
    </>
  );

  const side = (lang: ContentLang) => {
    const words = pair[lang];
    if (words === null) {
      return (
        <div className={editor.missing}>
          <p>{UI.editor.missingSide(langName(lang))}</p>
          <button
            type="button"
            className={form.secondary}
            aria-label={`${UI.editor.parity.twin(UI.editor.langShort[lang] ?? lang)} ${contextOf(lang)}`}
            onClick={() => {
              change('name', lang, (item) => architectureModel.twin(item, lang));
              // The button gives way to the new fields: the focus goes to the first of them.
              focusLater(id(lang, 'name'));
            }}
          >
            {UI.editor.parity.twin(UI.editor.langShort[lang] ?? lang)}
          </button>
        </div>
      );
    }
    return (
      <>
        <TextField id={id(lang, 'name')} label={F.name} value={words.name} max={80} error={error(lang, 'name')} labelledBy={ctx(lang)} onChange={(value) => setText(lang, 'name', value)} />
        <TextField
          id={id(lang, 'description')}
          label={F.description}
          value={words.description}
          max={300}
          multiline
          error={error(lang, 'description')}
          labelledBy={ctx(lang)}
          onChange={(value) => setText(lang, 'description', value)}
        />
        {!noAdapters && !drawnIn(pair, lang) ? <p className={rows.note}>{TEXT.notDrawn.side}</p> : null}
      </>
    );
  };

  return (
    <>
      {(['common', 'es', 'en'] as const).map((scope) => (
        <span key={scope} id={ctx(scope)} hidden>
          {contextOf(scope)}
        </span>
      ))}
      <PairedFields common={common} es={side('es')} en={side('en')} />
      <AdapterList port={pair} context={context} idOf={id} ctx={ctx} contextOf={contextOf} position={index + 1} portName={name} />
    </>
  );
}

const hasContent = (pair: PortPair): boolean =>
  pair.common.id.trim() !== '' || pair.common.adapters.length > 0 || [pair.es, pair.en].some((words) => words !== null && (words.name.trim() !== '' || words.description.trim() !== ''));

/** Ports drawn in each language; more than the plane holds go in a list under it. */
function LayoutNotes({ draft }: { draft: ArchitectureDraft }) {
  const notes = LANGS.flatMap((lang) => {
    const count = buildHexModel(toArchitecture(draft, lang))?.ports.length ?? 0;
    return count > MAX_RADIAL ? [{ lang, count }] : [];
  });
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map(({ lang, count }) => (
        <p key={lang} className={rows.note}>
          {TEXT.listLayout(langName(lang), count)}
        </p>
      ))}
    </>
  );
}

/** Architecture: the core per language, a live preview of the plane and the ports with their adapters, saved as one document. */
export function ArchitectureEditor({ initial, path = '/admin/architecture/', navigate, storage, validate }: ArchitectureEditorProps) {
  return (
    <EditorFrame
      model={architectureModel}
      initial={initial}
      path={path}
      {...(navigate ? { navigate } : {})}
      {...(storage !== undefined ? { storage } : {})}
      {...(validate ? { validate } : {})}
    >
      {(context) => (
        <>
          <CoreBlock context={context} />
          <HexPreview draft={context.draft} />
          <section className={editor.frame} aria-labelledby="puertos-titulo">
            <h2 id="puertos-titulo" className={editor.panelTitle}>
              {TEXT.ports}
            </h2>
            <StatusLegend />
            <LayoutNotes draft={context.draft} />
            <ItemList<PortPair>
              items={context.draft.items}
              max={LIMITS.ports}
              addLabel={TEXT.add}
              emptyText={TEXT.empty}
              limitText={TEXT.limit(LIMITS.ports)}
              label={(pair, index) => architectureModel.itemLabel(pair, index)}
              detail={(pair) => [pair.common.id, TEXT.adapterCount(pair.common.adapters.length)].filter((part) => part !== '').join(' · ')}
              hasContent={hasContent}
              errorCount={(key) => context.errors.items[key] ?? 0}
              reveal={context.reveal}
              onAdd={() => {
                const fresh = newPort();
                context.update((current) => ({ ...current, items: addPair(current.items, fresh) }));
                return fresh.key;
              }}
              onRemove={(key) => context.update((current) => ({ ...current, items: removePair(current.items, key) }))}
              onMove={(key, delta) => context.update((current) => ({ ...current, items: movePair(current.items, key, delta) }))}
            >
              {(pair, index) => <PortFields pair={pair} index={index} context={context} />}
            </ItemList>
          </section>
        </>
      )}
    </EditorFrame>
  );
}
