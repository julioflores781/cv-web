import type { ContentKind, ContentLang } from '@/lib/api/admin';
import { isObj, listOf, type Obj } from './content/model';

/** Versions the history screen asks for (the API's default; it takes 1–200). */
export const HISTORY_LIMIT = 50;
/** Visible length of a comment in the list; the whole comment stays in `title` and in the snapshot view. */
export const COMMENT_PREVIEW = 80;
/** Version numbers are a Java `int` in the API. */
const INT_MAX = 2_147_483_647;

const first = (raw: string | string[] | undefined): string | undefined => (Array.isArray(raw) ? raw[0] : raw);

/** `?lang=`: `es` or `en`; anything else (absent, repeated, unknown) is Spanish. */
export const parseLang = (raw: string | string[] | undefined): ContentLang => (first(raw) === 'en' ? 'en' : 'es');

/** `?v=`: a version number (digits only, 1 to the int range); anything else is ignored (`null`) and never reaches the API. */
export function parseVersionParam(raw: string | string[] | undefined): number | null {
  const value = first(raw);
  if (value === undefined || !/^\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return n >= 1 && n <= INT_MAX ? n : null;
}

/** `/admin/history/services/?lang=es` (and `&v=3` for a snapshot). */
export const historyUrl = (kind: ContentKind, lang: ContentLang, version?: number | null): string =>
  `/admin/history/${kind}/?lang=${lang}${version ? `&v=${version}` : ''}`;

/** A comment cut to `max` code points (with «…»); `truncated` tells whether the full text must go in a `title`. */
export function shortComment(comment: string, max = COMMENT_PREVIEW): { text: string; truncated: boolean } {
  const points = Array.from(comment);
  return points.length <= max ? { text: comment, truncated: false } : { text: `${points.slice(0, max).join('').trimEnd()}…`, truncated: true };
}

export interface SnapshotItem {
  id: string;
  label: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The items of a stored document as «id — title» lines for the read-only view (the architecture core first, as `core`). */
export function snapshotItems(kind: ContentKind, document: Obj | null): SnapshotItem[] {
  if (kind === 'architecture') {
    const core = isObj(document?.core) ? document.core : null;
    const ports = listOf(document, 'ports').map((port) => ({ id: text(port.id), label: text(port.name) }));
    return core ? [{ id: 'core', label: text(core.name) }, ...ports] : ports;
  }
  return listOf(document, kind).map((item) => ({ id: text(item.id), label: text(item.title) }));
}
