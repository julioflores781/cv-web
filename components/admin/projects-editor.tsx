'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContentLang, UploadedImage, ViolationEntry } from '@/lib/api/admin';
import type { DraftStorage } from '@/lib/admin/content/drafts';
import { addPair, movePair, removePair, updatePair, type ContentView } from '@/lib/admin/content/model';
import { fieldId } from '@/lib/admin/content/paths';
import {
  canHaveImages,
  clientRequired,
  DISCLOSURES,
  newProject,
  projectsModel,
  RELATIONS,
  withDisclosure,
  type ProjectCommon,
  type ProjectLinkDraft,
  type ProjectPair,
  type ProjectsDraft,
  type ProjectText,
} from '@/lib/admin/content/projects';
import { suggestId } from '@/lib/admin/content/slug';
import { LIMITS, type SaveCandidate } from '@/lib/admin/content/validate';
import type { ImageLibrary, UploadedPreview } from '@/lib/admin/images';
import { UI } from '@/lib/admin/messages';
import { EditorFrame, type EditorContext } from './editor-frame';
import { ItemList } from './item-list';
import { useFocusLater } from './use-focus-later';
import { PairedFields, SelectField, TextField } from './paired-field';
import { ProjectImagesBlock, type ProjectImagesBlockProps } from './project-images-block';
import { RowList } from './row-list';
import { TagListField } from './tag-list-field';
import form from './form.module.css';
import styles from './editor.module.css';

interface ProjectsEditorProps {
  initial: ContentView;
  path?: string;
  navigate?: (url: string) => void;
  storage?: DraftStorage | null;
  validate?: (kind: 'services' | 'projects' | 'architecture', candidate: SaveCandidate) => ViolationEntry[];
  /** The storage listing (key → public URL), read by the page; thumbnails and «missing» warnings come from it. */
  library?: ImageLibrary;
  /** Replaces the browser upload in tests. */
  upload?: ProjectImagesBlockProps['upload'];
}

/** What every project's image block shares: the storage listing and this visit's uploads. */
type ImagesShared = Pick<ProjectImagesBlockProps, 'library' | 'uploads' | 'onUploaded' | 'onPreviewFailed' | 'upload'>;

type Scope = 'common' | ContentLang;

const TEXT = UI.projects;
const FIELDS = { ...UI.editor.fields, ...UI.projects.fields };

const options = (values: readonly string[], labels: Record<string, string>, current: string) => [
  ...(values.includes(current) ? [] : [{ value: current, label: TEXT.unknownOption(current || '—') }]),
  ...values.map((value) => ({ value, label: labels[value] ?? value })),
];

function ProjectFields({ pair, index, context, images }: { pair: ProjectPair; index: number; context: EditorContext<ProjectsDraft>; images: ImagesShared }) {
  const { draft, update, errors } = context;
  const [notice, setNotice] = useState('');
  const focusLater = useFocusLater();
  const id = (scope: Scope, field: string) => fieldId({ itemKey: pair.key, scope, field });
  const error = (scope: Scope, field: string) => errors.fields[id(scope, field)];
  const ctx = (scope: Scope) => `${pair.key}-ctx-${scope}`;
  const title = pair.es?.title.trim() || pair.en?.title.trim() || pair.common.id;
  /** Context text of each scope: always the position, so equal titles never give equal names. */
  const contextOf = (scope: Scope) => TEXT.context(TEXT.scopes[scope] ?? scope, index + 1, title);
  const change = (field: string, scope: Scope, apply: (pair: ProjectPair) => ProjectPair, reordered: readonly string[] = []) =>
    update((current) => ({ ...current, items: updatePair(current.items, pair.key, apply) }), id(scope, field), reordered);

  const setCommon = (field: string, patch: Partial<ProjectCommon>) => change(field, 'common', (item) => ({ ...item, common: { ...item.common, ...patch } }));

  const setText = <K extends keyof ProjectText>(lang: ContentLang, field: string, key: K, value: ProjectText[K], reordered: readonly string[] = []) => {
    const apply = (item: ProjectPair): ProjectPair => {
      const text = item[lang];
      if (text === null) return item;
      const next: ProjectPair = { ...item, [lang]: { ...text, [key]: value } };
      // A new project gets its id from the Spanish title until the id is typed by hand.
      if (!item.saved && lang === 'es' && key === 'title' && typeof value === 'string') {
        const taken = draft.items.filter((other) => other.key !== item.key).map((other) => other.common.id);
        if (item.common.id === '' || item.common.id === suggestId(text.title, taken)) next.common = { ...item.common, id: suggestId(value, taken) };
      }
      return next;
    };
    change(field, lang, apply, reordered);
  };

  const copyToEnglish = (key: 'stack' | 'links') => {
    const source = pair.es;
    if (source === null || pair.en === null) return;
    const value = key === 'stack' ? [...source.stack] : source.links.map((link) => ({ ...link }));
    change(key, 'en', (item) => (item.en === null ? item : { ...item, en: { ...item.en, [key]: value } }));
    setNotice(TEXT.copied[key]);
  };

  /** Announces what a change of relation or visibility does to the client and the images (as text, not only at save time). */
  const announceEligibility = (next: ProjectCommon) => {
    const notes: Array<string | null> = [
      next.client === '' && pair.common.client !== '' ? TEXT.client.cleared : null,
      next.images.length > 0 && canHaveImages(pair.common) && !canHaveImages(next) ? TEXT.imageBlock.mustRemove : null,
    ];
    const text = notes.filter((note) => note !== null).join(' ');
    if (text !== '') setNotice(text);
  };

  const setDisclosure = (value: string) => {
    announceEligibility(withDisclosure(pair.common, value));
    change('disclosure', 'common', (item) => ({ ...item, common: withDisclosure(item.common, value) }));
  };

  const setRelation = (value: string) => {
    announceEligibility({ ...pair.common, relation: value });
    setCommon('relation', { relation: value });
  };

  const anonymous = pair.common.disclosure === 'anonymous';
  const clientHint = anonymous ? TEXT.client.anonymous : clientRequired(pair.common) ? TEXT.client.required : TEXT.client.optional;

  const common = (
    <>
      <TextField
        id={id('common', 'id')}
        label={FIELDS.id}
        value={pair.common.id}
        readOnly={pair.saved}
        hint={pair.saved ? UI.editor.idLocked : UI.editor.idHint}
        error={error('common', 'id')}
        labelledBy={ctx('common')}
        onChange={(value) => setCommon('id', { id: value.toLowerCase() })}
      />
      <div className={styles.row}>
        <SelectField
          id={id('common', 'relation')}
          label={FIELDS.relation}
          value={pair.common.relation}
          options={options(RELATIONS, TEXT.relations, pair.common.relation)}
          error={error('common', 'relation')}
          labelledBy={ctx('common')}
          onChange={setRelation}
        />
        <SelectField
          id={id('common', 'disclosure')}
          label={FIELDS.disclosure}
          value={pair.common.disclosure}
          options={options(DISCLOSURES, TEXT.disclosures, pair.common.disclosure)}
          error={error('common', 'disclosure')}
          labelledBy={ctx('common')}
          onChange={setDisclosure}
        />
      </div>
      <TextField
        id={id('common', 'client')}
        label={FIELDS.client}
        value={pair.common.client}
        max={160}
        disabled={anonymous}
        hint={clientHint}
        error={error('common', 'client')}
        labelledBy={ctx('common')}
        onChange={(value) => setCommon('client', { client: value })}
      />
      <div className={styles.row}>
        <TextField
          id={id('common', 'startDate')}
          label={FIELDS.startDate}
          value={pair.common.startDate}
          hint={TEXT.dateHint}
          error={error('common', 'startDate')}
          labelledBy={ctx('common')}
          onChange={(value) => setCommon('startDate', { startDate: value.trim() })}
        />
        <TextField
          id={id('common', 'endDate')}
          label={FIELDS.endDate}
          value={pair.common.endDate}
          hint={TEXT.endHint}
          error={error('common', 'endDate')}
          labelledBy={ctx('common')}
          onChange={(value) => setCommon('endDate', { endDate: value.trim() })}
        />
      </div>
    </>
  );

  const side = (lang: ContentLang) => {
    const text = pair[lang];
    if (text === null) {
      return (
        <div className={styles.missing}>
          <p>{UI.editor.missingSide(UI.editor.langs[lang]?.toLowerCase() ?? lang)}</p>
          <button
            type="button"
            className={form.secondary}
            onClick={() => {
              change('title', lang, (item) => projectsModel.twin(item, lang));
              // The button gives way to the new fields: the focus goes to the first of them.
              focusLater(id(lang, 'title'));
            }}
          >
            {UI.editor.parity.twin(UI.editor.langShort[lang] ?? lang)}
          </button>
        </div>
      );
    }
    const field = (key: 'title' | 'summary' | 'role' | 'clientLabel', max: number, multiline = false) => (
      <TextField
        id={id(lang, key)}
        label={FIELDS[key]}
        value={text[key]}
        max={max}
        multiline={multiline}
        error={error(lang, key)}
        labelledBy={ctx(lang)}
        onChange={(value) => setText(lang, key, key, value)}
      />
    );
    const copy = (key: 'stack' | 'links', what: string) =>
      lang === 'en' && pair.es !== null ? (
        <button type="button" className={form.secondary} lang="es" aria-label={`${TEXT.copy(what.toLowerCase())} ${contextOf(lang)}`} onClick={() => copyToEnglish(key)}>
          {TEXT.copy(what.toLowerCase())}
        </button>
      ) : null;
    return (
      <>
        {field('title', 160)}
        {field('summary', 800, true)}
        {field('role', 160)}
        {field('clientLabel', 160)}
        <TagListField
          id={id(lang, 'stack')}
          label={FIELDS.stack}
          lang={lang}
          tags={text.stack}
          max={LIMITS.stack}
          maxLength={60}
          error={error(lang, 'stack')}
          labelledBy={ctx(lang)}
          context={contextOf(lang)}
          extra={copy('stack', FIELDS.stack)}
          onChange={(stack) => setText(lang, 'stack', 'stack', stack)}
        />
        <RowList<string>
          id={id(lang, 'highlights')}
          legend={FIELDS.highlights}
          items={text.highlights}
          max={LIMITS.highlights}
          addLabel={TEXT.highlights.add}
          limitText={TEXT.highlights.full}
          rowName={(i) => TEXT.highlights.name(i + 1)}
          empty={() => ''}
          error={error(lang, 'highlights')}
          context={contextOf(lang)}
          onChange={(highlights, reordered) => setText(lang, 'highlights', 'highlights', highlights, reordered ? [id(lang, 'highlights')] : [])}
        >
          {(value, i, set) => (
            <TextField
              id={id(lang, `highlights.${i}`)}
              label={FIELDS.highlight(i + 1)}
              value={value}
              max={400}
              multiline
              lang={lang}
              error={error(lang, `highlights.${i}`)}
              labelledBy={ctx(lang)}
              onChange={set}
            />
          )}
        </RowList>
        <RowList<ProjectLinkDraft>
          id={id(lang, 'links')}
          legend={FIELDS.links}
          items={text.links}
          max={LIMITS.links}
          addLabel={TEXT.links.add}
          limitText={TEXT.links.full}
          rowName={(i) => TEXT.links.name(i + 1)}
          empty={() => ({ label: '', url: '' })}
          error={error(lang, 'links')}
          context={contextOf(lang)}
          extra={copy('links', FIELDS.links)}
          onChange={(links, reordered) => setText(lang, 'links', 'links', links, reordered ? [id(lang, 'links')] : [])}
        >
          {(link, i, set) => (
            <>
              <TextField
                id={id(lang, `links.${i}.label`)}
                label={FIELDS.linkLabel(i + 1)}
                value={link.label}
                max={80}
                lang={lang}
                error={error(lang, `links.${i}.label`)}
                labelledBy={ctx(lang)}
                onChange={(label) => set({ ...link, label })}
              />
              <TextField
                id={id(lang, `links.${i}.url`)}
                label={FIELDS.linkUrl(i + 1)}
                value={link.url}
                inputMode="url"
                hint={TEXT.links.urlHint}
                error={error(lang, `links.${i}.url`)}
                labelledBy={ctx(lang)}
                onChange={(url) => set({ ...link, url })}
              />
            </>
          )}
        </RowList>
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
      <ProjectImagesBlock pair={pair} context={context} blockId={id('common', 'images')} fieldIdOf={id} ctx={ctx} contextText={contextOf('common')} {...images} />
      <p role="status" className={styles.visuallyHidden}>
        {notice}
      </p>
    </>
  );
}

const textHasContent = (text: ProjectText | null): boolean =>
  text !== null &&
  ((['title', 'summary', 'role', 'clientLabel'] as const).some((key) => text[key].trim() !== '') || text.stack.length > 0 || text.highlights.length > 0 || text.links.length > 0);

const hasContent = (pair: ProjectPair): boolean =>
  [pair.common.id, pair.common.client, pair.common.startDate, pair.common.endDate].some((value) => value.trim() !== '') ||
  pair.common.images.length > 0 ||
  textHasContent(pair.es) ||
  textHasContent(pair.en);

/** Header detail of a project: id · relation · visibility · number of images. */
const detail = (pair: ProjectPair): string =>
  [pair.common.id, TEXT.relations[pair.common.relation] ?? pair.common.relation, TEXT.disclosures[pair.common.disclosure] ?? pair.common.disclosure, TEXT.images(pair.common.images.length)]
    .filter((part) => part !== '')
    .join(' · ');

/** Projects: ES/EN pairs with the common data (privacy rules included) edited once, in one document saved at once. */
export function ProjectsEditor({ initial, path = '/admin/projects/', navigate, storage, validate, library, upload }: ProjectsEditorProps) {
  const [uploads, setUploads] = useState<ReadonlyMap<string, UploadedPreview>>(new Map());
  const previews = useRef(new Set<string>());

  // Local previews live as long as the editor: every object URL still held is revoked on leaving.
  useEffect(() => {
    const held = previews.current;
    return () => {
      held.forEach((url) => URL.revokeObjectURL(url));
      held.clear();
    };
  }, []);

  const onUploaded = useCallback((image: UploadedImage, file: File) => {
    const preview = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined;
    if (preview !== undefined) previews.current.add(preview);
    setUploads((current) => new Map(current).set(image.key, { url: image.url, preview }));
  }, []);

  // The side effects (revoking, forgetting the URL) happen here, once; the state updater stays pure.
  const onPreviewFailed = useCallback((key: string, preview: string) => {
    if (previews.current.delete(preview)) URL.revokeObjectURL(preview);
    setUploads((current) => {
      const entry = current.get(key);
      return entry === undefined || entry.preview !== preview ? current : new Map(current).set(key, { url: entry.url, failed: true });
    });
  }, []);

  const images: ImagesShared = { library, uploads, onUploaded, onPreviewFailed, ...(upload ? { upload } : {}) };

  return (
    <EditorFrame
      model={projectsModel}
      initial={initial}
      path={path}
      {...(navigate ? { navigate } : {})}
      {...(storage !== undefined ? { storage } : {})}
      {...(validate ? { validate } : {})}
    >
      {(context) => (
        <ItemList<ProjectPair>
          items={context.draft.items}
          max={LIMITS.projects}
          addLabel={TEXT.add}
          emptyText={TEXT.empty}
          limitText={TEXT.limit(LIMITS.projects)}
          label={(pair, index) => projectsModel.itemLabel(pair, index)}
          detail={detail}
          hasContent={hasContent}
          removeText={(pair, label) => (pair.common.images.length > 0 ? TEXT.removeWithImages(label, pair.common.images.length) : UI.editor.removeText(label))}
          errorCount={(key) => context.errors.items[key] ?? 0}
          reveal={context.reveal}
          onAdd={() => {
            const fresh = newProject();
            context.update((current) => ({ ...current, items: addPair(current.items, fresh) }));
            return fresh.key;
          }}
          onRemove={(key) => context.update((current) => ({ ...current, items: removePair(current.items, key) }))}
          onMove={(key, delta) => context.update((current) => ({ ...current, items: movePair(current.items, key, delta) }))}
        >
          {(pair, index) => <ProjectFields pair={pair} index={index} context={context} images={images} />}
        </ItemList>
      )}
    </EditorFrame>
  );
}
