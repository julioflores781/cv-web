import type { ContentKind, ContentLang, ViolationEntry } from '@/lib/api/admin';

/**
 * Editing model shared by the three editors. Each item is a pair: the fields the API forces to be equal in ES and EN (`common`, edited once)
 * and the translatable ones per language. A side is `null` when the stored documents have the item in one language only («sin pareja»).
 * Adding, removing and moving act on the pair, so parity holds by construction. Every operation returns new objects.
 */

export type Obj = Record<string, unknown>;

export interface Pair<C, T> {
  /** Stable key of the pair in this browser (React key, DOM ids); never sent to the API. */
  key: string;
  /** Exists in the published documents: its id is read-only. */
  saved: boolean;
  common: C;
  es: T | null;
  en: T | null;
}

export interface PairedDraft<C = unknown, T = unknown> {
  items: Array<Pair<C, T>>;
}

export type Documents = Record<ContentLang, Obj>;

/** Where a part of a path lands inside one item. */
export interface FieldTarget {
  scope: 'common' | 'lang';
  field: string;
}

/** A one-click repair the parity panel offers for a difference the form keeps («Igualar EN a ES»). */
export interface ParityFix<D> {
  key: string;
  /** What it fixes, for the button's accessible name. */
  label: string;
  /** The difference, as shown in the panel. */
  text: string;
  apply: (draft: D) => D;
}

/** What `EditorFrame` needs to know about one kind. */
export interface EditorModel<D extends PairedDraft> {
  kind: ContentKind;
  /** Name of the list in the stored document (`services`, `projects`, `ports`). */
  listKey: string;
  pair(es: Obj | null, en: Obj | null): D;
  serialize(draft: D): Documents;
  /**
   * Field of an item from the rest of a path (`['price', 'from']`); `null` when it is not a field of the form. `item` and `lang` (the path's
   * language, `null` for parity paths) let nested lists map a position of one language to the item's own row.
   */
  target(rest: ReadonlyArray<string | number>, item?: D['items'][number], lang?: ContentLang | null): FieldTarget | null;
  /** Field of a path outside the list (the architecture core); `null` when there is none. */
  rootTarget?(segments: ReadonlyArray<string | number>): FieldTarget | null;
  /** Visible label of an item (its title in Spanish, else its id, else its position). */
  itemLabel(pair: D['items'][number], index: number): string;
  /** Visible label of a field (`Título`). */
  fieldLabel(field: string): string;
  /** Gives an unpaired item the language it lacks, empty («Crear gemelo»). */
  twin(pair: D['items'][number], lang: ContentLang): D['items'][number];
  /** Checks a draft read back from `sessionStorage`. */
  isDraft(value: unknown): value is D;
  /** After a save, when nested items must turn published too; the plain `markSaved` otherwise. */
  markSaved?(draft: D): D;
  /** Repairs of parity differences that the draft keeps on purpose. */
  fixes?(draft: D): Array<ParityFix<D>>;
}

let sequence = 0;
/** A key unique in this page (and unlikely to collide with one restored from a draft). */
export function newKey(): string {
  sequence += 1;
  return `k${Date.now().toString(36)}${sequence.toString(36)}`;
}

export const isObj = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
export const listOf = (document: Obj | null, key: string): Obj[] => {
  const value = document?.[key];
  return Array.isArray(value) ? value.filter(isObj) : [];
};

/**
 * Pairs the items of both languages by id, in the Spanish order; English items without a Spanish twin go last.
 * `split(item)` gives the common part and the translatable part of a stored item.
 */
export function pairItems<C, T>(es: Obj[], en: Obj[], split: (item: Obj) => { common: C; text: T }): Array<Pair<C, T>> {
  const pending = [...en];
  const pairs: Array<Pair<C, T>> = es.map((item) => {
    const index = pending.findIndex((candidate) => candidate.id === item.id && typeof item.id === 'string');
    const twin = index >= 0 ? pending.splice(index, 1)[0] : undefined;
    const left = split(item);
    return { key: newKey(), saved: true, common: left.common, es: left.text, en: twin === undefined ? null : split(twin).text };
  });
  for (const item of pending) {
    const right = split(item);
    pairs.push({ key: newKey(), saved: true, common: right.common, es: null, en: right.text });
  }
  return pairs;
}

export function addPair<P extends { key: string }>(items: readonly P[], pair: P): P[] {
  return [...items, pair];
}

export function removePair<P extends { key: string }>(items: readonly P[], key: string): P[] {
  return items.filter((item) => item.key !== key);
}

/** Moves one pair `delta` places (clamped to the ends). */
export function movePair<P extends { key: string }>(items: readonly P[], key: string, delta: number): P[] {
  const from = items.findIndex((item) => item.key === key);
  if (from < 0) return [...items];
  const to = Math.max(0, Math.min(items.length - 1, from + delta));
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as P);
  return next;
}

export function updatePair<P extends { key: string }>(items: readonly P[], key: string, change: (pair: P) => P): P[] {
  return items.map((item) => (item.key === key ? change(item) : item));
}

/** Gives a pair the language it lacks, starting from `empty` («Crear gemelo»). */
export function twinPair<C, T>(pair: Pair<C, T>, lang: ContentLang, empty: T): Pair<C, T> {
  return pair[lang] === null ? { ...pair, [lang]: empty } : pair;
}

/** After a successful save every pair is published: ids become read-only. */
export function markSaved<D extends PairedDraft>(draft: D): D {
  return { ...draft, items: draft.items.map((pair) => ({ ...pair, saved: true })) };
}

/** One language of a `GET /admin/api/content/{kind}/` answer, as the browser receives it. */
export interface LanguageView {
  version: number;
  publishedAt: string | null;
  source: string | null;
  content: Obj | null;
}

export interface ContentView {
  languages: Record<ContentLang, LanguageView>;
  parity: { ok: boolean; differences: ViolationEntry[] };
}

const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const optString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function languageView(raw: unknown): LanguageView | null {
  if (!isObj(raw) || !isVersion(raw.version)) return null;
  if (raw.content !== null && raw.content !== undefined && !isObj(raw.content)) return null;
  return { version: raw.version, publishedAt: optString(raw.publishedAt), source: optString(raw.source), content: isObj(raw.content) ? raw.content : null };
}

/** Checks the shape of a content answer (the handler already validated it; this guards the browser against anything else). */
export function parseContentView(raw: unknown): ContentView | null {
  if (!isObj(raw) || !isObj(raw.languages)) return null;
  const es = languageView(raw.languages.es);
  const en = languageView(raw.languages.en);
  if (es === null || en === null) return null;
  const parity = isObj(raw.parity) ? raw.parity : {};
  const differences = Array.isArray(parity.differences)
    ? parity.differences.filter((entry): entry is ViolationEntry => isObj(entry) && typeof entry.path === 'string' && typeof entry.code === 'string').map(({ path, code }) => ({ path, code }))
    : [];
  return { languages: { es, en }, parity: { ok: typeof parity.ok === 'boolean' ? parity.ok : differences.length === 0, differences } };
}

export const versionsOf = (view: ContentView): Record<ContentLang, number> => ({ es: view.languages.es.version, en: view.languages.en.version });
