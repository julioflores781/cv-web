import type { ContentLang, ViolationEntry } from '@/lib/api/admin';
import type { EditorModel, PairedDraft } from './model';
import { comparePaths } from './validate';

/** A violation path split into parts: `es.services[1].price.from` -> `{lang:'es', segments:['services', 1, 'price', 'from']}`. Parity paths have no language. */
export interface ParsedPath {
  lang: ContentLang | null;
  segments: Array<string | number>;
}

const MAX_PATH = 200;
const PART = /^([A-Za-z][A-Za-z0-9]{0,63})((?:\[\d{1,4}\])*)$/;
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

/** `null` for anything that is not a well-formed path (empty parts, `..`, `[x]`, `__proto__`); never throws. */
export function parsePath(path: unknown): ParsedPath | null {
  if (typeof path !== 'string' || path === '' || path.length > MAX_PATH) return null;
  const segments: Array<string | number> = [];
  for (const part of path.split('.')) {
    const match = PART.exec(part);
    if (!match) return null;
    const name = match[1] as string;
    if (FORBIDDEN.has(name)) return null;
    segments.push(name);
    for (const index of (match[2] as string).matchAll(/\[(\d+)\]/g)) segments.push(Number(index[1]));
  }
  const [first, second] = segments;
  if ((first === 'es' || first === 'en') && typeof second !== 'number') return { lang: first, segments: segments.slice(1) };
  return { lang: null, segments };
}

export interface FieldLocation {
  /** Pair the field belongs to; `null` for fields of the save itself (the comment) or outside the list (the architecture core). */
  itemKey: string | null;
  scope: 'common' | ContentLang;
  field: string;
}

export interface MappedError {
  path: string;
  code: string;
  location: FieldLocation | null;
  /** DOM id of the field that shows it; `null` when it only goes to the summary. */
  fieldId: string | null;
}

export interface ErrorMap {
  /** Field id -> code shown next to that field. */
  fields: Record<string, string>;
  /** Every error once (ES and EN copies of a common field merged), sorted by path. */
  entries: MappedError[];
  /** Pair key -> number of errors in it (for the badge, and to open it). */
  items: Record<string, number>;
}

export const EMPTY_ERRORS: ErrorMap = { fields: {}, entries: [], items: {} };

export const COMMENT_FIELD_ID = 'campo-comentario';

/** DOM id of a field of the form; also used by the summary links. */
export function fieldId(location: FieldLocation): string {
  if (location.itemKey === null && location.field === 'comment') return COMMENT_FIELD_ID;
  if (location.itemKey === null) return `campo-${location.scope}-${location.field.replace(/[^A-Za-z0-9]+/g, '-')}`;
  return `campo-${location.itemKey}-${location.scope}-${location.field.replace(/[^A-Za-z0-9]+/g, '-')}`;
}

/** Index of each document's items in the draft: the n-th item of the ES document is the n-th pair that has Spanish. */
function indexes<D extends PairedDraft>(draft: D, lang: ContentLang): string[] {
  return draft.items.filter((pair) => pair[lang] !== null).map((pair) => pair.key);
}

function locate<D extends PairedDraft>(model: EditorModel<D>, draft: D, parsed: ParsedPath, lists: Record<ContentLang, string[]>): FieldLocation | null {
  const [head, index, ...rest] = parsed.segments;
  if (parsed.lang === null && head === 'comment' && index === undefined) return { itemKey: null, scope: 'common', field: 'comment' };
  if (head !== model.listKey || typeof index !== 'number') {
    // Fields outside the list (the architecture core) belong to no item.
    const root = model.rootTarget?.(parsed.segments) ?? null;
    if (root === null) return null;
    return { itemKey: null, scope: root.scope === 'common' || parsed.lang === null ? 'common' : parsed.lang, field: root.field };
  }
  // Parity paths carry no language: they compare position n of both lists, which is position n of the Spanish one.
  const itemKey = (parsed.lang === null ? (lists.es[index] ?? lists.en[index]) : lists[parsed.lang][index]) ?? null;
  if (itemKey === null) return null;
  if (rest.length === 0) return { itemKey, scope: 'common', field: '' };
  const target = model.target(rest, draft.items.find((pair) => pair.key === itemKey), parsed.lang);
  if (target === null) return { itemKey, scope: 'common', field: '' };
  return { itemKey, scope: target.scope === 'common' || parsed.lang === null ? 'common' : parsed.lang, field: target.field };
}

/**
 * Places the violations of a save (from the client mirror or a 422 of the API) on the fields of the draft. Common fields reported for ES and EN
 * show once; paths that match no field, or a field outside the list, go to the summary only.
 */
export function mapViolations<D extends PairedDraft>(model: EditorModel<D>, draft: D, violations: readonly ViolationEntry[]): ErrorMap {
  const lists = { es: indexes(draft, 'es'), en: indexes(draft, 'en') };
  const sorted = [...violations].sort((a, b) => comparePaths(a.path, b.path));
  const fields: Record<string, string> = {};
  const items: Record<string, number> = {};
  const entries: MappedError[] = [];
  const seen = new Set<string>();
  for (const { path, code } of sorted) {
    const parsed = parsePath(path);
    const location = parsed === null ? null : locate(model, draft, parsed, lists);
    const id = location === null || location.field === '' ? null : fieldId(location);
    const dedupe = id === null ? `${location?.itemKey ?? ''}|${path}|${code}` : `${id}|${code}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    entries.push({ path, code, location, fieldId: id });
    if (id !== null && fields[id] === undefined) fields[id] = code;
    if (location?.itemKey) items[location.itemKey] = (items[location.itemKey] ?? 0) + 1;
  }
  return { fields, entries, items };
}

/**
 * The error map without the fields `drop` picks (and their summary entries); the per-item counts are recounted from what is left. Used to take
 * server marks off a field that was edited, or off every row of a list whose rows moved (their marks were placed by position).
 */
export function dropFields(errors: ErrorMap, drop: (fieldId: string) => boolean): ErrorMap {
  const fields = Object.fromEntries(Object.entries(errors.fields).filter(([id]) => !drop(id)));
  const entries = errors.entries.filter((entry) => entry.fieldId === null || !drop(entry.fieldId));
  const items: Record<string, number> = {};
  for (const entry of entries) {
    const key = entry.location?.itemKey;
    if (key) items[key] = (items[key] ?? 0) + 1;
  }
  return { fields, entries, items };
}

/** True for the fields below a list (`<listId>-<n>-...`): the ids of its rows, which are positional. */
export const isBelow = (listIds: readonly string[]) => (id: string): boolean => listIds.some((list) => id.startsWith(`${list}-`));
