import { describe, expect, it } from 'vitest';
import { clearDraft, loadDraft, MAX_DRAFT_BYTES, saveDraft, type DraftStorage } from './drafts';

const isDraft = (value: unknown): value is { items: string[] } => typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items);

function memory(): DraftStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const throwing: DraftStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('quota');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('drafts', () => {
  it('T311: saves, loads and clears per kind as {baseVersions, draft, savedAt}; a throwing storage, corrupt JSON, another kind or over 200 KB give null without throwing', () => {
    const storage = memory();
    expect(saveDraft(storage, 'services', { es: 2, en: 3 }, { items: ['a'] }, 1000)).toBe(true);
    expect(JSON.parse(storage.data.get('cv-admin-draft:services') ?? '')).toEqual({ kind: 'services', baseVersions: { es: 2, en: 3 }, draft: { items: ['a'] }, savedAt: 1000 });
    expect(loadDraft(storage, 'services', isDraft)).toEqual({ kind: 'services', baseVersions: { es: 2, en: 3 }, draft: { items: ['a'] }, savedAt: 1000 });
    expect(loadDraft(storage, 'projects', isDraft)).toBeNull();
    storage.data.set('cv-admin-draft:projects', storage.data.get('cv-admin-draft:services') ?? '');
    expect(loadDraft(storage, 'projects', isDraft)).toBeNull();
    storage.data.set('cv-admin-draft:architecture', '{not json');
    expect(loadDraft(storage, 'architecture', isDraft)).toBeNull();
    storage.data.set('cv-admin-draft:architecture', JSON.stringify({ kind: 'architecture', baseVersions: { es: 1, en: 1 }, draft: { nope: 1 }, savedAt: 1 }));
    expect(loadDraft(storage, 'architecture', isDraft)).toBeNull();
    clearDraft(storage, 'services');
    expect(loadDraft(storage, 'services', isDraft)).toBeNull();

    expect(saveDraft(storage, 'services', { es: 0, en: 0 }, { items: ['x'.repeat(MAX_DRAFT_BYTES)] })).toBe(false);
    expect(storage.data.has('cv-admin-draft:services')).toBe(false);
    storage.data.set('cv-admin-draft:services', JSON.stringify({ kind: 'services', baseVersions: { es: 0, en: 0 }, draft: { items: ['x'.repeat(MAX_DRAFT_BYTES)] }, savedAt: 1 }));
    expect(loadDraft(storage, 'services', isDraft)).toBeNull();

    expect(saveDraft(throwing, 'services', { es: 0, en: 0 }, { items: [] })).toBe(false);
    expect(loadDraft(throwing, 'services', isDraft)).toBeNull();
    expect(() => clearDraft(throwing, 'services')).not.toThrow();
    expect(saveDraft(null, 'services', { es: 0, en: 0 }, { items: [] })).toBe(false);
    expect(loadDraft(null, 'services', isDraft)).toBeNull();
  });
});
