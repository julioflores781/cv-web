import type { ContentKind, ContentLang } from '@/lib/api/admin';
import { isObj, type Obj } from './model';

/** Changes of one item between two versions of a document. Images are compared by `key`. */
export interface ModifiedItem {
  id: string;
  fields: string[];
  images?: { added: string[]; removed: string[] };
}

export interface DocumentDiff {
  added: string[];
  removed: string[];
  modified: ModifiedItem[];
  /** The ids both versions share are in a different order. */
  reordered: boolean;
}

export type ContentDiff = Record<ContentLang, DocumentDiff>;

const LIST_KEY: Record<ContentKind, string> = { services: 'services', projects: 'projects', architecture: 'ports' };

/** JSON with the keys of every object sorted: `{a, b}` and `{b, a}` compare equal. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObj(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const items = (document: Obj | null, key: string): Obj[] => {
  const value = document?.[key];
  return Array.isArray(value) ? value.filter(isObj) : [];
};
const idOf = (item: Obj, index: number): string => (typeof item.id === 'string' && item.id !== '' ? item.id : `#${index + 1}`);
const keysOf = (item: Obj): string[] => items(item, 'images').map((image) => String(image.key));

function compareItems(id: string, before: Obj, after: Obj): ModifiedItem | null {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const fields = names.filter((name) => canonical(before[name]) !== canonical(after[name]));
  if (fields.length === 0) return null;
  if (!fields.includes('images')) return { id, fields };
  const old = keysOf(before);
  const now = keysOf(after);
  return { id, fields, images: { added: now.filter((key) => !old.includes(key)), removed: old.filter((key) => !now.includes(key)) } };
}

/** What changed from `before` to `after` in one language, item by item (by `id`). The architecture core counts as an item called `core`. */
export function diffDocuments(kind: ContentKind, before: Obj | null, after: Obj | null): DocumentDiff {
  const key = LIST_KEY[kind];
  const left = new Map(items(before, key).map((item, i) => [idOf(item, i), item]));
  const right = new Map(items(after, key).map((item, i) => [idOf(item, i), item]));
  const added = [...right.keys()].filter((id) => !left.has(id));
  const removed = [...left.keys()].filter((id) => !right.has(id));
  const modified: ModifiedItem[] = [];
  if (kind === 'architecture' && canonical(before?.core) !== canonical(after?.core)) {
    const core = compareItems('core', isObj(before?.core) ? before.core : {}, isObj(after?.core) ? after.core : {});
    if (core) modified.push(core);
  }
  for (const [id, item] of right) {
    const old = left.get(id);
    const change = old === undefined ? null : compareItems(id, old, item);
    if (change) modified.push(change);
  }
  const shared = (map: Map<string, Obj>) => [...map.keys()].filter((id) => left.has(id) && right.has(id)).join('\n');
  return { added, removed, modified, reordered: shared(left) !== shared(right) };
}

export function diffContent(kind: ContentKind, before: Record<ContentLang, Obj | null>, after: Record<ContentLang, Obj | null>): ContentDiff {
  return { es: diffDocuments(kind, before.es, after.es), en: diffDocuments(kind, before.en, after.en) };
}

export const isEmptyDiff = (diff: DocumentDiff): boolean => diff.added.length === 0 && diff.removed.length === 0 && diff.modified.length === 0 && !diff.reordered;

/** Number of edits: distinct items added, removed or changed in either language, plus one when the order changed. */
export function countChanges(diff: ContentDiff): number {
  const ids = new Set<string>();
  let reordered = false;
  for (const side of [diff.es, diff.en]) {
    for (const id of [...side.added, ...side.removed, ...side.modified.map((item) => item.id)]) ids.add(id);
    reordered ||= side.reordered;
  }
  return ids.size + (reordered ? 1 : 0);
}
