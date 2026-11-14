import { UI } from '@/lib/admin/messages';
import { isObj, listOf, newKey, pairItems, twinPair, type EditorModel, type Obj, type Pair, type PairedDraft } from './model';

/**
 * Projects model. Common part (what `ContentParity` forces to be equal in ES and EN): id, relation, disclosure, client, dates and the images
 * (`key`, `width`, `height`, by position). Per language: title, summary, role, clientLabel, stack, highlights, links and the `alt` of each image.
 * Privacy rules live here too: an anonymous project has no client, and only `own` + `public` projects take images.
 */

export const RELATIONS = ['own', 'employer'] as const;
export const DISCLOSURES = ['public', 'anonymous'] as const;

export interface ProjectImageRef {
  key: string;
  width: number;
  height: number;
}

export interface ProjectCommon {
  id: string;
  relation: string;
  disclosure: string;
  client: string;
  startDate: string;
  endDate: string;
  images: ProjectImageRef[];
}

export interface ProjectLinkDraft {
  label: string;
  url: string;
}

export interface ProjectText {
  title: string;
  summary: string;
  role: string;
  clientLabel: string;
  stack: string[];
  highlights: string[];
  links: ProjectLinkDraft[];
  /** `alt` of each common image, by position. */
  alts: string[];
}

export type ProjectPair = Pair<ProjectCommon, ProjectText>;
export type ProjectsDraft = PairedDraft<ProjectCommon, ProjectText>;

export const emptyProjectText = (): ProjectText => ({ title: '', summary: '', role: '', clientLabel: '', stack: [], highlights: [], links: [], alts: [] });

/** Only projects of my own that are public may show images (the API answers `IMAGES_NOT_ALLOWED_FOR_PROJECT` otherwise). */
export const canHaveImages = (common: Pick<ProjectCommon, 'relation' | 'disclosure'>): boolean => common.relation === 'own' && common.disclosure === 'public';

/** A public project of an employer must name its client; an anonymous one must not have any. */
export const clientRequired = (common: Pick<ProjectCommon, 'relation' | 'disclosure'>): boolean => common.relation === 'employer' && common.disclosure === 'public';

/** Changes the visibility; turning a project anonymous empties its client (it does not come back when it turns public again). */
export function withDisclosure(common: ProjectCommon, disclosure: string): ProjectCommon {
  return { ...common, disclosure, client: disclosure === 'anonymous' ? '' : common.client };
}

/** A new project starts with the most restrictive options: an employer's, anonymous. */
export function newProject(): ProjectPair {
  return {
    key: newKey(),
    saved: false,
    common: { id: '', relation: 'employer', disclosure: 'anonymous', client: '', startDate: '', endDate: '', images: [] },
    es: emptyProjectText(),
    en: emptyProjectText(),
  };
}

/** Removes the image at `index` from the project (the common part and the `alt` of both languages). The file stays in the storage. */
export function withoutImage(pair: ProjectPair, index: number): ProjectPair {
  const drop = <T>(list: readonly T[]): T[] => list.filter((_, i) => i !== index);
  return {
    ...pair,
    common: { ...pair.common, images: drop(pair.common.images) },
    es: pair.es === null ? null : { ...pair.es, alts: drop(pair.es.alts) },
    en: pair.en === null ? null : { ...pair.en, alts: drop(pair.en.alts) },
  };
}

/** Adds an image at the end (the common part, and an empty `alt` in each language), pending until the document is saved. */
export function withImage(pair: ProjectPair, image: ProjectImageRef): ProjectPair {
  const add = (side: ProjectText | null): ProjectText | null => (side === null ? null : { ...side, alts: [...pair.common.images.map((_, i) => side.alts[i] ?? ''), ''] });
  return { ...pair, common: { ...pair.common, images: [...pair.common.images, { ...image }] }, es: add(pair.es), en: add(pair.en) };
}

/** Moves the image at `from` to `to` (0 is the cover), carrying its `alt` in both languages: key, width and height stay paired by position. */
export function withImageMoved(pair: ProjectPair, from: number, to: number): ProjectPair {
  const count = pair.common.images.length;
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) return pair;
  const move = <T>(list: readonly T[]): T[] => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    return next;
  };
  const side = (text: ProjectText | null): ProjectText | null => (text === null ? null : { ...text, alts: move(pair.common.images.map((_, i) => text.alts[i] ?? '')) });
  return { ...pair, common: { ...pair.common, images: move(pair.common.images) }, es: side(pair.es), en: side(pair.en) };
}

/** Image keys used by the given stored project documents (the published ones): the gallery tells «in use» from «in use by an old version». */
export function imageKeysOf(...documents: ReadonlyArray<Obj | null | undefined>): Set<string> {
  const keys = new Set<string>();
  for (const document of documents) {
    if (!isObj(document)) continue;
    for (const project of listOf(document, 'projects')) for (const image of listOf(project, 'images')) if (typeof image.key === 'string') keys.add(image.key);
  }
  return keys;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
const side = (value: unknown): number => (typeof value === 'number' ? value : 0);

function split(item: Obj): { common: ProjectCommon; text: ProjectText } {
  const images = listOf(item, 'images');
  return {
    common: {
      id: text(item.id),
      relation: text(item.relation),
      disclosure: text(item.disclosure),
      client: text(item.client),
      startDate: text(item.startDate),
      endDate: text(item.endDate),
      images: images.map((image) => ({ key: text(image.key), width: side(image.width), height: side(image.height) })),
    },
    text: {
      title: text(item.title),
      summary: text(item.summary),
      role: text(item.role),
      clientLabel: text(item.clientLabel),
      stack: strings(item.stack),
      highlights: strings(item.highlights),
      links: listOf(item, 'links').map((link) => ({ label: text(link.label), url: text(link.url) })),
      alts: images.map((image) => text(image.alt)),
    },
  };
}

/** Optional texts travel only when they have something; lists always travel (an empty list means the same as an absent one to the API). */
function serializeProject(common: ProjectCommon, own: ProjectText): Obj {
  const optional = (key: string, value: string): Obj => (value === '' ? {} : { [key]: value });
  return {
    id: common.id,
    title: own.title,
    summary: own.summary,
    relation: common.relation,
    ...optional('role', own.role),
    disclosure: common.disclosure,
    ...optional('client', common.client),
    ...optional('clientLabel', own.clientLabel),
    ...optional('startDate', common.startDate),
    ...optional('endDate', common.endDate),
    stack: [...own.stack],
    highlights: [...own.highlights],
    links: own.links.map((link) => ({ label: link.label, url: link.url })),
    ...(common.images.length === 0 ? {} : { images: common.images.map((image, i) => ({ key: image.key, alt: own.alts[i] ?? '', width: image.width, height: image.height })) }),
  };
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isImageRef = (value: unknown): value is ProjectImageRef => isObj(value) && typeof value.key === 'string' && typeof value.width === 'number' && typeof value.height === 'number';
const isLink = (value: unknown): value is ProjectLinkDraft => isObj(value) && typeof value.label === 'string' && typeof value.url === 'string';
const isProjectText = (value: unknown): value is ProjectText =>
  isObj(value) &&
  ['title', 'summary', 'role', 'clientLabel'].every((key) => typeof value[key] === 'string') &&
  isStrings(value.stack) &&
  isStrings(value.highlights) &&
  isStrings(value.alts) &&
  Array.isArray(value.links) &&
  value.links.every(isLink);
const isProjectCommon = (value: unknown): value is ProjectCommon =>
  isObj(value) &&
  ['id', 'relation', 'disclosure', 'client', 'startDate', 'endDate'].every((key) => typeof value[key] === 'string') &&
  Array.isArray(value.images) &&
  value.images.every(isImageRef);
const isProjectPair = (value: unknown): value is ProjectPair =>
  isObj(value) &&
  typeof value.key === 'string' &&
  typeof value.saved === 'boolean' &&
  isProjectCommon(value.common) &&
  (value.es === null || isProjectText(value.es)) &&
  (value.en === null || isProjectText(value.en));

const FIELDS = UI.projects.fields;
const FIELD_LABELS: Record<string, string> = {
  id: UI.editor.fields.id,
  title: UI.editor.fields.title,
  summary: UI.editor.fields.summary,
  relation: FIELDS.relation,
  disclosure: FIELDS.disclosure,
  client: FIELDS.client,
  startDate: FIELDS.startDate,
  endDate: FIELDS.endDate,
  role: FIELDS.role,
  clientLabel: FIELDS.clientLabel,
  stack: FIELDS.stack,
  highlights: FIELDS.highlights,
  links: FIELDS.links,
  images: FIELDS.images,
};

/** `highlights.2` -> «Logro 3», `links.0.url` -> «URL del enlace 1», `images.1.alt` -> «Texto alternativo de la imagen 2». */
function fieldLabel(field: string): string {
  const fixed = FIELD_LABELS[field];
  if (fixed !== undefined) return fixed;
  const [list, index, leaf] = field.split('.');
  const n = Number(index) + 1;
  if (list === 'highlights' && leaf === undefined) return FIELDS.highlight(n);
  if (list === 'links' && leaf === 'label') return FIELDS.linkLabel(n);
  if (list === 'links' && leaf === 'url') return FIELDS.linkUrl(n);
  if (list === 'images' && leaf === 'alt') return FIELDS.alt(n);
  if (list === 'images' && leaf === undefined) return FIELDS.image(n);
  return field;
}

const COMMON_FIELDS = new Set(['id', 'relation', 'disclosure', 'client', 'startDate', 'endDate']);
const TEXT_FIELDS = new Set(['title', 'summary', 'role', 'clientLabel']);

export const projectsModel: EditorModel<ProjectsDraft> = {
  kind: 'projects',
  listKey: 'projects',
  pair: (es, en) => ({ items: pairItems(listOf(es, 'projects'), listOf(en, 'projects'), split) }),
  serialize: (draft) => {
    const sideOf = (lang: 'es' | 'en') =>
      draft.items.flatMap((pair) => {
        const own = pair[lang];
        return own === null ? [] : [serializeProject(pair.common, own)];
      });
    return { es: { projects: sideOf('es') }, en: { projects: sideOf('en') } };
  },
  target: (rest) => {
    const [first, second, third, ...more] = rest;
    if (more.length > 0 || typeof first !== 'string') return null;
    if (second === undefined) {
      if (COMMON_FIELDS.has(first) || first === 'images') return { scope: 'common', field: first };
      if (TEXT_FIELDS.has(first) || first === 'stack' || first === 'highlights' || first === 'links') return { scope: 'lang', field: first };
      return null;
    }
    if (typeof second !== 'number') return null;
    if (first === 'stack' && third === undefined) return { scope: 'lang', field: 'stack' };
    if (first === 'highlights' && third === undefined) return { scope: 'lang', field: `highlights.${second}` };
    if (first === 'links') return third === 'label' || third === 'url' ? { scope: 'lang', field: `links.${second}.${third}` } : { scope: 'lang', field: 'links' };
    if (first === 'images') return third === 'alt' ? { scope: 'lang', field: `images.${second}.alt` } : { scope: 'common', field: `images.${second}` };
    return null;
  },
  itemLabel: (pair, index) => pair.es?.title.trim() || pair.en?.title.trim() || pair.common.id || `${UI.projects.item} ${index + 1}`,
  fieldLabel,
  twin: (pair, lang) => twinPair(pair, lang, { ...emptyProjectText(), alts: pair.common.images.map(() => '') }),
  isDraft: (value): value is ProjectsDraft => isObj(value) && Array.isArray(value.items) && value.items.every(isProjectPair),
};
