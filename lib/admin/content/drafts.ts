import type { ContentKind, ContentLang } from '@/lib/api/admin';
import { isObj } from './model';

/**
 * Unsaved work of an editor, kept in `sessionStorage` (one entry per kind) so a 401, a 409 or a reload never loses it.
 * Every access is wrapped: storage that is missing, full, blocked or holding garbage just means «no draft».
 */

export const MAX_DRAFT_BYTES = 200 * 1024;
const PREFIX = 'cv-admin-draft:';

export interface StoredDraft<D> {
  kind: ContentKind;
  /** Versions the draft was based on: when they differ from the published ones, the panel warns before restoring. */
  baseVersions: Record<ContentLang, number>;
  draft: D;
  /** Epoch milliseconds. */
  savedAt: number;
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's `sessionStorage`, or `null` when it does not exist or access throws. */
export function sessionDrafts(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const keyOf = (kind: ContentKind): string => `${PREFIX}${kind}`;
const bytes = (text: string): number => new TextEncoder().encode(text).length;
const isVersions = (value: unknown): value is Record<ContentLang, number> =>
  isObj(value) && Number.isInteger(value.es) && Number.isInteger(value.en) && (value.es as number) >= 0 && (value.en as number) >= 0;

/** `false` when nothing was stored (no storage, over 200 KB, quota or a blocked storage). */
export function saveDraft<D>(storage: DraftStorage | null, kind: ContentKind, baseVersions: Record<ContentLang, number>, draft: D, now = Date.now()): boolean {
  if (storage === null) return false;
  try {
    const text = JSON.stringify({ kind, baseVersions, draft, savedAt: now } satisfies StoredDraft<D>);
    if (bytes(text) > MAX_DRAFT_BYTES) return false;
    storage.setItem(keyOf(kind), text);
    return true;
  } catch {
    return false;
  }
}

/** The stored draft of `kind` when it is intact and `isDraft` accepts it; `null` otherwise. Never throws. */
export function loadDraft<D>(storage: DraftStorage | null, kind: ContentKind, isDraft: (value: unknown) => value is D): StoredDraft<D> | null {
  if (storage === null) return null;
  try {
    const text = storage.getItem(keyOf(kind));
    if (text === null || bytes(text) > MAX_DRAFT_BYTES) return null;
    const value: unknown = JSON.parse(text);
    if (!isObj(value) || value.kind !== kind || !isVersions(value.baseVersions) || typeof value.savedAt !== 'number' || !isDraft(value.draft)) return null;
    return { kind, baseVersions: { es: value.baseVersions.es, en: value.baseVersions.en }, draft: value.draft, savedAt: value.savedAt };
  } catch {
    return null;
  }
}

export function clearDraft(storage: DraftStorage | null, kind: ContentKind): void {
  if (storage === null) return;
  try {
    storage.removeItem(keyOf(kind));
  } catch {
    // Nothing to do: a storage that cannot be written holds no draft we could clear.
  }
}
