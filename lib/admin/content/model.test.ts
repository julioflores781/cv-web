import { describe, expect, it } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import { canonical, countChanges, diffContent } from './diff';
import { addPair, movePair, parseContentView, removePair, twinPair } from './model';
import { EMPTY_SERVICE_TEXT, newService, servicesModel } from './services';
import { suggestId } from './slug';
import { validateSave } from './validate';

describe('paired model', () => {
  it('T297: the services sample pairs and serializes back to the same documents (price null = absent) and passes the validator', () => {
    const es = sample('services.es');
    const en = sample('services.en');
    const draft = servicesModel.pair(es, en);
    expect(draft.items).toHaveLength(2);
    expect(draft.items.every((pair) => pair.es !== null && pair.en !== null && pair.saved)).toBe(true);
    const back = servicesModel.serialize(draft);
    expect(canonical(back.es)).toBe(canonical(es));
    expect(canonical(back.en)).toBe(canonical(en));
    // An absent price serializes as null: the same meaning for the API.
    const withoutPrice = { services: [{ id: 'x', title: 'T', summary: 'S' }] };
    expect(servicesModel.serialize(servicesModel.pair(withoutPrice, withoutPrice)).es).toEqual({ services: [{ id: 'x', title: 'T', summary: 'S', price: null }] });
    expect(validateSave('services', { comment: '', documents: back })).toEqual([]);
  });

  it('T298: content null in both gives an empty list; null in one shows the other language items as unpaired', () => {
    expect(servicesModel.pair(null, null).items).toEqual([]);
    const onlyEs = servicesModel.pair(sample('services.es'), null);
    expect(onlyEs.items.map((pair) => [pair.common.id, pair.es?.title, pair.en])).toEqual([
      ['servicio-ejemplo', 'Servicio de ejemplo', null],
      ['servicio-a-consultar', 'Servicio a consultar', null],
    ]);
    const onlyEn = servicesModel.pair(null, sample('services.en'));
    expect(onlyEn.items.every((pair) => pair.es === null && pair.en !== null)).toBe(true);
    // Mixed: an id present in one language only stays unpaired, the rest pair by id whatever the order.
    const mixed = servicesModel.pair({ services: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }, { services: [{ id: 'c', title: 'C' }, { id: 'a', title: 'A en' }] });
    expect(mixed.items.map((pair) => [pair.common.id, pair.es?.title ?? null, pair.en?.title ?? null])).toEqual([
      ['a', 'A', 'A en'],
      ['b', 'B', null],
      ['c', null, 'C'],
    ]);
    const twinned = { items: mixed.items.map((pair) => (pair.common.id === 'b' ? twinPair(pair, 'en', EMPTY_SERVICE_TEXT) : pair)) };
    expect((servicesModel.serialize(twinned).en.services as Array<{ id: string }>).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('T300: add, remove and move act on ES and EN at once without changing the original; the suggested id comes from the title and is made unique', () => {
    const original = servicesModel.pair(sample('services.es'), sample('services.en'));
    const frozen = JSON.stringify(original);
    const fresh = newService();
    const added = { items: addPair(original.items, fresh) };
    let docs = servicesModel.serialize(added);
    expect(docs.es.services).toHaveLength(3);
    expect(docs.en.services).toHaveLength(3);
    const moved = { items: movePair(added.items, fresh.key, -2) };
    docs = servicesModel.serialize(moved);
    expect((docs.es.services as Array<{ id: string }>).map((s) => s.id)).toEqual(['', 'servicio-ejemplo', 'servicio-a-consultar']);
    expect((docs.en.services as Array<{ id: string }>).map((s) => s.id)).toEqual(['', 'servicio-ejemplo', 'servicio-a-consultar']);
    expect(movePair(moved.items, fresh.key, -5).map((p) => p.key)).toEqual(moved.items.map((p) => p.key));
    const removed = { items: removePair(moved.items, original.items[0]!.key) };
    docs = servicesModel.serialize(removed);
    expect((docs.es.services as unknown[]).length).toBe(2);
    expect((docs.en.services as unknown[]).length).toBe(2);
    expect(JSON.stringify(original)).toBe(frozen);
    const base = servicesModel.serialize(original);
    expect(countChanges(diffContent('services', base, servicesModel.serialize(removed)))).toBe(2);
    expect(countChanges(diffContent('services', base, servicesModel.serialize(original)))).toBe(0);
    expect(suggestId('Servicio de ejemplo', ['servicio-de-ejemplo'])).toBe('servicio-de-ejemplo-2');
    expect(suggestId('Servicio de ejemplo', ['servicio-de-ejemplo', 'servicio-de-ejemplo-2'])).toBe('servicio-de-ejemplo-3');
  });

  it('extra: parseContentView accepts version 0 with null content and rejects broken shapes', () => {
    const lang = (version: unknown, content: unknown) => ({ version, publishedAt: null, source: null, comment: null, content });
    expect(parseContentView({ languages: { es: lang(0, null), en: lang(0, null) }, parity: { ok: true, differences: [] } })?.languages.es.version).toBe(0);
    expect(parseContentView({ languages: { es: lang(-1, null), en: lang(0, null) } })).toBeNull();
    expect(parseContentView({ languages: { es: lang(1, []), en: lang(0, null) } })).toBeNull();
    expect(parseContentView(null)).toBeNull();
  });
});
