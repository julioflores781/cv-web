import type { ContentLang } from '@/lib/api/admin';
import type { AdapterStatus, Architecture } from '@/lib/api/types';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { UI } from '@/lib/admin/messages';
import { isObj, listOf, newKey, pairItems, type EditorModel, type FieldTarget, type Obj, type Pair, type PairedDraft, type ParityFix } from './model';

/**
 * Architecture (hexagon) model. The core is per language only. Each port is a pair: its id and its adapters are common, its name and
 * description per language. Each adapter is a pair too: id and status common (what `ContentParity` compares), name and note per language.
 * A status that already differs between ES and EN in stored data stays in the English side (`status`), so the parity panel can show it and
 * «Igualar EN a ES» can fix it; choosing a status in the form sets both languages.
 */

export const ADAPTER_STATUSES: readonly AdapterStatus[] = ['in-this-api', 'production', 'experiment'];

export interface CoreText {
  name: string;
  description: string;
}

export interface AdapterCommon {
  id: string;
  status: string;
}

export interface AdapterText {
  name: string;
  note: string;
  /** This language's own status when stored data broke parity (English only); `null` = the common one. */
  status: string | null;
}

export type AdapterPair = Pair<AdapterCommon, AdapterText>;

export interface PortCommon {
  id: string;
  adapters: AdapterPair[];
}

export interface PortText {
  name: string;
  description: string;
}

export type PortPair = Pair<PortCommon, PortText>;

export interface ArchitectureDraft extends PairedDraft<PortCommon, PortText> {
  core: Record<ContentLang, CoreText>;
}

const LANGS: readonly ContentLang[] = ['es', 'en'];
const STATUS_LABELS = getDictionary('es').plane.status;

export const isAdapterStatus = (value: string): value is AdapterStatus => (ADAPTER_STATUSES as readonly string[]).includes(value);
/** Spanish label of a status (the public dictionary's), or the raw value when it is not one of the three. */
export const statusLabel = (status: string): string => (isAdapterStatus(status) ? STATUS_LABELS[status] : status);

const emptyAdapterText = (): AdapterText => ({ name: '', note: '', status: null });
const emptyPortText = (): PortText => ({ name: '', description: '' });

export function newAdapter(): AdapterPair {
  return { key: newKey(), saved: false, common: { id: '', status: ADAPTER_STATUSES[0] as string }, es: emptyAdapterText(), en: emptyAdapterText() };
}

export function newPort(): PortPair {
  return { key: newKey(), saved: false, common: { id: '', adapters: [] }, es: emptyPortText(), en: emptyPortText() };
}

/** The status an adapter has in one language. */
export const statusOf = (adapter: AdapterPair, lang: ContentLang): string => adapter[lang]?.status ?? adapter.common.status;

/** Chooses a status for both languages (any stored mismatch goes away). */
export function withStatus(adapter: AdapterPair, status: string): AdapterPair {
  const clear = (text: AdapterText | null): AdapterText | null => (text === null ? null : { ...text, status: null });
  return { ...adapter, common: { ...adapter.common, status }, es: clear(adapter.es), en: clear(adapter.en) };
}

/** Gives an adapter the language it lacks, empty. */
export const twinAdapter = (adapter: AdapterPair, lang: ContentLang): AdapterPair => (adapter[lang] === null ? { ...adapter, [lang]: emptyAdapterText() } : adapter);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function pairAdapters(es: Obj[], en: Obj[]): AdapterPair[] {
  const raw = pairItems(es, en, (item) => ({
    common: { id: text(item.id), status: text(item.status) },
    text: { name: text(item.name), note: text(item.note), status: text(item.status) as string | null },
  }));
  return raw.map((adapter) => {
    const status = adapter.es?.status ?? adapter.en?.status ?? '';
    const own = adapter.es !== null && adapter.en !== null && adapter.en.status !== status ? adapter.en.status : null;
    return {
      ...adapter,
      common: { ...adapter.common, status },
      es: adapter.es === null ? null : { ...adapter.es, status: null },
      en: adapter.en === null ? null : { ...adapter.en, status: own },
    };
  });
}

function pair(es: Obj | null, en: Obj | null): ArchitectureDraft {
  const coreOf = (document: Obj | null): CoreText => {
    const core = isObj(document?.core) ? document.core : {};
    return { name: text(core.name), description: text(core.description) };
  };
  type RawText = PortText & { adapters: Obj[] };
  const raw = pairItems<{ id: string }, RawText>(listOf(es, 'ports'), listOf(en, 'ports'), (item) => ({
    common: { id: text(item.id) },
    text: { name: text(item.name), description: text(item.description), adapters: listOf(item, 'adapters') },
  }));
  const items = raw.map(
    (port): PortPair => ({
      key: port.key,
      saved: port.saved,
      common: { id: port.common.id, adapters: pairAdapters(port.es?.adapters ?? [], port.en?.adapters ?? []) },
      es: port.es === null ? null : { name: port.es.name, description: port.es.description },
      en: port.en === null ? null : { name: port.en.name, description: port.en.description },
    }),
  );
  return { core: { es: coreOf(es), en: coreOf(en) }, items };
}

/** Optional texts travel only when they have something; `adapters` always travels. */
function serialize(draft: ArchitectureDraft): Record<ContentLang, Obj> {
  const optional = (key: string, value: string): Obj => (value === '' ? {} : { [key]: value });
  const side = (lang: ContentLang): Obj => ({
    core: { name: draft.core[lang].name, ...optional('description', draft.core[lang].description) },
    ports: draft.items.flatMap((port) => {
      const own = port[lang];
      if (own === null) return [];
      return [
        {
          id: port.common.id,
          name: own.name,
          ...optional('description', own.description),
          adapters: port.common.adapters.flatMap((adapter) => {
            const words = adapter[lang];
            return words === null ? [] : [{ id: adapter.common.id, name: words.name, status: statusOf(adapter, lang), ...optional('note', words.note) }];
          }),
        },
      ];
    }),
  });
  return { es: side('es'), en: side('en') };
}

/** One language of the draft in the shape the public site receives (the preview runs it through `buildHexModel`, like the site). */
export function toArchitecture(draft: ArchitectureDraft, lang: ContentLang): Architecture {
  const orNull = (value: string): string | null => (value === '' ? null : value);
  return {
    core: { name: draft.core[lang].name, description: orNull(draft.core[lang].description) },
    ports: draft.items.flatMap((port) => {
      const own = port[lang];
      if (own === null) return [];
      const adapters = port.common.adapters.flatMap((adapter) => {
        const words = adapter[lang];
        const status = statusOf(adapter, lang);
        // An adapter with a status the API would refuse is never drawn by the site either.
        return words === null || !isAdapterStatus(status) ? [] : [{ id: adapter.common.id, name: words.name, status, note: orNull(words.note) }];
      });
      return [{ id: port.common.id, name: own.name, description: orNull(own.description), adapters }];
    }),
  };
}

/** Draft position of the n-th adapter that has `lang` (Spanish for parity paths, which compare positions of both lists). */
function adapterIndex(port: PortPair | undefined, lang: ContentLang | null, n: number): number {
  if (port === undefined) return -1;
  const side = lang ?? 'es';
  const positions = port.common.adapters.flatMap((adapter, i) => (adapter[side] !== null ? [i] : []));
  return positions[n] ?? -1;
}

function target(rest: ReadonlyArray<string | number>, port?: PortPair, lang?: ContentLang | null): FieldTarget | null {
  const [first, second, third, ...more] = rest;
  if (more.length > 0 || typeof first !== 'string') return null;
  if (second === undefined) {
    if (first === 'id' || first === 'adapters') return { scope: 'common', field: first };
    if (first === 'name' || first === 'description') return { scope: 'lang', field: first };
    return null;
  }
  if (first !== 'adapters' || typeof second !== 'number') return null;
  const index = adapterIndex(port, lang ?? null, second);
  if (index < 0) return { scope: 'common', field: 'adapters' };
  if (third === undefined) return { scope: 'common', field: `adapters.${index}` };
  if (third === 'id' || third === 'status') return { scope: 'common', field: `adapters.${index}.${third}` };
  if (third === 'name' || third === 'note') return { scope: 'lang', field: `adapters.${index}.${third}` };
  return { scope: 'common', field: `adapters.${index}` };
}

/** `core` (missing), `core.name`, `core.description`: fields of each language's core, outside the ports. */
function rootTarget(segments: ReadonlyArray<string | number>): FieldTarget | null {
  const [first, second, ...more] = segments;
  if (first !== 'core') return null;
  if ((second === 'name' || second === 'description') && more.length === 0) return { scope: 'lang', field: `core.${second}` };
  return { scope: 'lang', field: 'core' };
}

const F = UI.architecture.fields;
const FIELD_LABELS: Record<string, string> = {
  id: UI.editor.fields.id,
  name: F.name,
  description: F.description,
  adapters: F.adapters,
  core: F.core,
  'core.name': F.coreName,
  'core.description': F.coreDescription,
};

/** `adapters.1.status` -> «Estado del adaptador 2». */
function fieldLabel(field: string): string {
  const fixed = FIELD_LABELS[field];
  if (fixed !== undefined) return fixed;
  const [list, index, leaf] = field.split('.');
  const n = Number(index) + 1;
  if (list !== 'adapters' || !Number.isInteger(n)) return field;
  if (leaf === undefined) return F.adapter(n);
  if (leaf === 'id') return F.adapterId(n);
  if (leaf === 'status') return F.status(n);
  if (leaf === 'name') return F.adapterName(n);
  if (leaf === 'note') return F.note(n);
  return field;
}

const portLabel = (port: PortPair, index: number): string => port.es?.name.trim() || port.en?.name.trim() || port.common.id || `${UI.architecture.item} ${index + 1}`;
export const adapterLabel = (adapter: AdapterPair, index: number): string =>
  adapter.es?.name.trim() || adapter.en?.name.trim() || adapter.common.id || F.adapter(index + 1);

/** One «Igualar EN a ES» per adapter whose English status differs from the Spanish one. */
function fixes(draft: ArchitectureDraft): Array<ParityFix<ArchitectureDraft>> {
  return draft.items.flatMap((port, p) =>
    port.common.adapters.flatMap((adapter, a) => {
      const own = adapter.en?.status ?? null;
      if (own === null || own === adapter.common.status) return [];
      const label = `${portLabel(port, p)} · ${adapterLabel(adapter, a)}`;
      return [
        {
          key: `${port.key}-${adapter.key}`,
          label,
          text: UI.architecture.mismatch(label, statusLabel(own), statusLabel(adapter.common.status)),
          apply: (current: ArchitectureDraft): ArchitectureDraft => ({
            ...current,
            items: current.items.map((item) =>
              item.key !== port.key ? item : { ...item, common: { ...item.common, adapters: item.common.adapters.map((x) => (x.key === adapter.key && x.en ? { ...x, en: { ...x.en, status: null } } : x)) } },
            ),
          }),
        },
      ];
    }),
  );
}

const isCore = (value: unknown): value is CoreText => isObj(value) && typeof value.name === 'string' && typeof value.description === 'string';
const isPortText = (value: unknown): value is PortText => isObj(value) && typeof value.name === 'string' && typeof value.description === 'string';
const isAdapterText = (value: unknown): value is AdapterText =>
  isObj(value) && typeof value.name === 'string' && typeof value.note === 'string' && (value.status === null || typeof value.status === 'string');
const isKeyed = (value: Obj): boolean => typeof value.key === 'string' && typeof value.saved === 'boolean';
const isAdapter = (value: unknown): value is AdapterPair =>
  isObj(value) &&
  isKeyed(value) &&
  isObj(value.common) &&
  typeof value.common.id === 'string' &&
  typeof value.common.status === 'string' &&
  (value.es === null || isAdapterText(value.es)) &&
  (value.en === null || isAdapterText(value.en));
const isPort = (value: unknown): value is PortPair =>
  isObj(value) &&
  isKeyed(value) &&
  isObj(value.common) &&
  typeof value.common.id === 'string' &&
  Array.isArray(value.common.adapters) &&
  value.common.adapters.every(isAdapter) &&
  (value.es === null || isPortText(value.es)) &&
  (value.en === null || isPortText(value.en));

export const architectureModel: EditorModel<ArchitectureDraft> = {
  kind: 'architecture',
  listKey: 'ports',
  pair,
  serialize,
  target,
  rootTarget,
  itemLabel: portLabel,
  fieldLabel,
  twin: (port, lang) => (port[lang] !== null ? port : { ...port, [lang]: emptyPortText(), common: { ...port.common, adapters: port.common.adapters.map((adapter) => twinAdapter(adapter, lang)) } }),
  isDraft: (value): value is ArchitectureDraft =>
    isObj(value) && isObj(value.core) && LANGS.every((lang) => isCore((value.core as Obj)[lang])) && Array.isArray(value.items) && value.items.every(isPort),
  markSaved: (draft) => ({
    ...draft,
    items: draft.items.map((port) => ({ ...port, saved: true, common: { ...port.common, adapters: port.common.adapters.map((adapter) => ({ ...adapter, saved: true })) } })),
  }),
  fixes,
};
