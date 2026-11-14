import { UI } from '@/lib/admin/messages';
import { isObj, listOf, newKey, pairItems, twinPair, type EditorModel, type Obj, type Pair, type PairedDraft } from './model';

/** Common part of a service: what the API forces to be equal in ES and EN. The amount stays text while it is edited. */
export interface ServiceCommon {
  id: string;
  /** «A consultar»: `price: null`. */
  onRequest: boolean;
  amount: string;
  currency: string;
}

export interface ServiceText {
  title: string;
  summary: string;
}

export type ServicePair = Pair<ServiceCommon, ServiceText>;
export type ServicesDraft = PairedDraft<ServiceCommon, ServiceText>;

export const DEFAULT_CURRENCY = 'EUR';
export const EMPTY_SERVICE_TEXT: ServiceText = { title: '', summary: '' };

export type Amount = { ok: true; value: number | null } | { ok: false };

/** `''` -> no amount; `1500`, `1500.50` -> a number; a negative, an exponent or more than two decimals is an error. */
export function parseAmount(text: string): Amount {
  const value = text.trim();
  if (value === '') return { ok: true, value: null };
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return { ok: false };
  return { ok: true, value: Number(value) };
}

/** What the currency field holds once typed: upper case, letters only, at most three. */
export const normalizeCurrency = (text: string): string => text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function split(item: Obj): { common: ServiceCommon; text: ServiceText } {
  const price = isObj(item.price) ? item.price : null;
  return {
    common: {
      id: text(item.id),
      onRequest: price === null,
      amount: price !== null && typeof price.from === 'number' ? String(price.from) : '',
      currency: price !== null && typeof price.currency === 'string' ? price.currency : DEFAULT_CURRENCY,
    },
    text: { title: text(item.title), summary: text(item.summary) },
  };
}

/** The stored price. An amount that is not a valid number travels as typed, so the validator reports it on `price.from`. */
function priceOf(common: ServiceCommon): Obj | null {
  if (common.onRequest) return null;
  const amount = parseAmount(common.amount);
  return { from: amount.ok ? amount.value : common.amount, currency: common.currency };
}

export function newService(): ServicePair {
  return { key: newKey(), saved: false, common: { id: '', onRequest: true, amount: '', currency: DEFAULT_CURRENCY }, es: { ...EMPTY_SERVICE_TEXT }, en: { ...EMPTY_SERVICE_TEXT } };
}

const isServiceText = (value: unknown): value is ServiceText => isObj(value) && typeof value.title === 'string' && typeof value.summary === 'string';
const isServiceCommon = (value: unknown): value is ServiceCommon =>
  isObj(value) && typeof value.id === 'string' && typeof value.onRequest === 'boolean' && typeof value.amount === 'string' && typeof value.currency === 'string';
const isServicePair = (value: unknown): value is ServicePair =>
  isObj(value) &&
  typeof value.key === 'string' &&
  typeof value.saved === 'boolean' &&
  isServiceCommon(value.common) &&
  (value.es === null || isServiceText(value.es)) &&
  (value.en === null || isServiceText(value.en));

const FIELD_LABELS: Record<string, string> = {
  id: UI.editor.fields.id,
  title: UI.editor.fields.title,
  summary: UI.editor.fields.summary,
  price: UI.editor.fields.price,
  'price.from': UI.editor.fields.amount,
  'price.currency': UI.editor.fields.currency,
};

export const servicesModel: EditorModel<ServicesDraft> = {
  kind: 'services',
  listKey: 'services',
  pair: (es, en) => ({ items: pairItems(listOf(es, 'services'), listOf(en, 'services'), split) }),
  serialize: (draft) => {
    const side = (lang: 'es' | 'en') =>
      draft.items.flatMap((pair) => {
        const own = pair[lang];
        return own === null ? [] : [{ id: pair.common.id, title: own.title, summary: own.summary, price: priceOf(pair.common) }];
      });
    return { es: { services: side('es') }, en: { services: side('en') } };
  },
  target: (rest) => {
    const [first, second, ...more] = rest;
    if (more.length > 0) return null;
    if (first === 'id' && second === undefined) return { scope: 'common', field: 'id' };
    if ((first === 'title' || first === 'summary') && second === undefined) return { scope: 'lang', field: first };
    if (first === 'price') {
      if (second === undefined) return { scope: 'common', field: 'price' };
      if (second === 'from' || second === 'currency') return { scope: 'common', field: `price.${second}` };
    }
    return null;
  },
  itemLabel: (pair, index) => pair.es?.title.trim() || pair.en?.title.trim() || pair.common.id || `${UI.services.item} ${index + 1}`,
  fieldLabel: (field) => FIELD_LABELS[field] ?? field,
  twin: (pair, lang) => twinPair(pair, lang, { ...EMPTY_SERVICE_TEXT }),
  isDraft: (value): value is ServicesDraft => isObj(value) && Array.isArray(value.items) && value.items.every(isServicePair),
};
