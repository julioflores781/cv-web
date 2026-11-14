import { describe, expect, it } from 'vitest';
import { sample } from '@/tests/helpers/admin-content';
import {
  architectureModel,
  newAdapter,
  newPort,
  statusOf,
  toArchitecture,
  withStatus,
  type ArchitectureDraft,
  type PortPair,
} from './architecture';
import { canonical, countChanges, diffContent } from './diff';
import { markSaved } from './model';
import { mapViolations } from './paths';
import { validateSave } from './validate';

type Doc = { core: Record<string, unknown>; ports: Array<Record<string, unknown> & { adapters: Array<Record<string, unknown>> }> };

const draftOf = (es: unknown, en: unknown): ArchitectureDraft => architectureModel.pair(es as Record<string, unknown>, en as Record<string, unknown>);
const portAt = (draft: ArchitectureDraft, index: number): PortPair => draft.items[index] as PortPair;

describe('architecture model', () => {
  it('T354: the architecture sample pairs common = port and adapter ids + status, per language core, name, description and note; description null ≡ absent; the round trip is identical', () => {
    const es = sample('architecture.es');
    const en = sample('architecture.en');
    const draft = draftOf(es, en);
    expect(draft.core).toEqual({
      es: { name: 'Dominio', description: 'Las reglas del negocio, sin saber qué hay fuera.' },
      en: { name: 'Domain', description: 'The business rules, unaware of what sits outside.' },
    });
    expect(draft.items).toHaveLength(2);
    const database = portAt(draft, 0);
    expect(database.common.id).toBe('database');
    expect(database.es).toEqual({ name: 'Base de datos', description: 'Dónde se guardan los datos.' });
    expect(database.en).toEqual({ name: 'Database', description: 'Where the data is stored.' });
    expect(database.common.adapters.map((adapter) => adapter.common)).toEqual([
      { id: 'postgresql', status: 'in-this-api' },
      { id: 'mongodb', status: 'production' },
    ]);
    expect(database.common.adapters[1]?.es).toEqual({ name: 'MongoDB', note: 'Nota de ejemplo', status: null });
    expect(database.common.adapters[1]?.en).toEqual({ name: 'MongoDB', note: 'Sample note', status: null });
    expect(portAt(draft, 1).en).toEqual({ name: 'Queues', description: '' });

    const back = architectureModel.serialize(draft);
    expect(canonical(back.es)).toBe(canonical(es));
    expect(canonical(back.en)).toBe(canonical(en));
    expect(countChanges(diffContent('architecture', { es, en }, back))).toBe(0);
    expect(validateSave('architecture', { comment: '', documents: back })).toEqual([]);

    // `null` descriptions and notes mean the same as absent ones: they are not sent and count as no change.
    const nulls = (document: Doc): Doc => ({
      core: { ...document.core, description: null },
      ports: document.ports.map((port) => ({ ...port, description: null, adapters: port.adapters.map((adapter) => ({ ...adapter, note: null })) })),
    });
    const withNulls = draftOf(nulls(es as Doc), nulls(en as Doc));
    const sent = architectureModel.serialize(withNulls);
    expect(sent.es.core).toEqual({ name: 'Dominio' });
    expect(JSON.stringify(sent)).not.toMatch(/"description"|"note"/);
    const stripped = (document: Doc) => {
      const copy = JSON.parse(JSON.stringify(document)) as Doc;
      delete copy.core.description;
      for (const port of copy.ports) {
        delete port.description;
        for (const adapter of port.adapters) delete adapter.note;
      }
      return copy;
    };
    expect(canonical(sent.es)).toBe(canonical(stripped(es as Doc)));
    expect(countChanges(diffContent('architecture', { es: stripped(es as Doc), en: stripped(en as Doc) }, sent))).toBe(0);
  });

  it('extra: version 0 pairs to an empty core in both languages and no ports; serialising it gives a core without a name, which the validator refuses (REQUIRED)', () => {
    const draft = draftOf(null, null);
    expect(draft).toMatchObject({ core: { es: { name: '', description: '' }, en: { name: '', description: '' } }, items: [] });
    const documents = architectureModel.serialize(draft);
    expect(documents).toEqual({ es: { core: { name: '' }, ports: [] }, en: { core: { name: '' }, ports: [] } });
    expect(validateSave('architecture', { comment: '', documents })).toEqual([
      { path: 'en.core.name', code: 'REQUIRED' },
      { path: 'es.core.name', code: 'REQUIRED' },
    ]);
  });

  it('extra: a status that differs between ES and EN stays in the draft (the EN side keeps its own), is reported by the parity fix and «Igualar EN a ES» clears it; choosing a status sets both', () => {
    const es = sample('architecture.es') as Doc;
    const en = JSON.parse(JSON.stringify(sample('architecture.en'))) as Doc;
    (en.ports[0]?.adapters[1] as Record<string, unknown>).status = 'experiment';
    const draft = draftOf(es, en);
    const mongo = portAt(draft, 0).common.adapters[1];
    expect(mongo?.common.status).toBe('production');
    expect(mongo?.en?.status).toBe('experiment');
    expect(statusOf(mongo as NonNullable<typeof mongo>, 'en')).toBe('experiment');
    expect(statusOf(mongo as NonNullable<typeof mongo>, 'es')).toBe('production');
    // The published mismatch is kept as it is: no change until the user acts.
    expect(countChanges(diffContent('architecture', { es, en }, architectureModel.serialize(draft)))).toBe(0);

    const fixes = architectureModel.fixes?.(draft) ?? [];
    expect(fixes).toHaveLength(1);
    expect(fixes[0]?.text).toBe('«Base de datos · MongoDB»: el estado en inglés (proyecto de prueba) no coincide con el español (en producción).');
    const fixed = (fixes[0] as NonNullable<(typeof fixes)[0]>).apply(draft);
    expect(architectureModel.fixes?.(fixed)).toEqual([]);
    expect(architectureModel.serialize(fixed).en).toMatchObject({ ports: [{ adapters: [{}, { status: 'production' }] }, {}] });

    const chosen = withStatus(mongo as NonNullable<typeof mongo>, 'in-this-api');
    expect(chosen.common.status).toBe('in-this-api');
    expect(chosen.en?.status).toBeNull();
  });

  it('extra: adapters pair by id inside a port; one in a single language is unpaired, and the port twin gives every adapter the missing side', () => {
    const es = sample('architecture.es') as Doc;
    const en = JSON.parse(JSON.stringify(sample('architecture.en'))) as Doc;
    en.ports[0]?.adapters.splice(1, 1);
    en.ports.pop();
    const draft = draftOf(es, en);
    expect(portAt(draft, 0).common.adapters[1]?.en).toBeNull();
    const queue = portAt(draft, 1);
    expect(queue.en).toBeNull();
    expect(queue.common.adapters[0]?.en).toBeNull();
    const twin = architectureModel.twin(queue, 'en');
    expect(twin.en).toEqual({ name: '', description: '' });
    expect(twin.common.adapters[0]?.en).toEqual({ name: '', note: '', status: null });
    // Unpaired adapters only travel in their own language.
    expect(architectureModel.serialize(draft).en.ports).toEqual([expect.objectContaining({ id: 'database', adapters: [expect.objectContaining({ id: 'postgresql' })] })]);
  });

  it('extra: a save marks ports and adapters as published (their ids turn read-only); new items start unsaved with the first status', () => {
    const port = newPort();
    expect(port).toMatchObject({ saved: false, common: { id: '', adapters: [] }, es: { name: '', description: '' }, en: { name: '', description: '' } });
    const adapter = newAdapter();
    expect(adapter).toMatchObject({ saved: false, common: { id: '', status: 'in-this-api' }, es: { name: '', note: '', status: null }, en: { name: '', note: '', status: null } });
    const draft: ArchitectureDraft = { core: { es: { name: 'N', description: '' }, en: { name: 'N', description: '' } }, items: [{ ...port, common: { ...port.common, adapters: [adapter] } }] };
    const saved = architectureModel.markSaved ? architectureModel.markSaved(draft) : markSaved(draft);
    expect(saved.items[0]?.saved).toBe(true);
    expect(saved.items[0]?.common.adapters[0]?.saved).toBe(true);
    expect(saved.core).toEqual(draft.core);
    expect(architectureModel.isDraft(JSON.parse(JSON.stringify(saved)))).toBe(true);
    expect(architectureModel.isDraft({ items: [] })).toBe(false);
    expect(architectureModel.isDraft({ ...draft, core: { es: { name: 1 }, en: draft.core.en } })).toBe(false);
  });

  it('extra: toArchitecture gives the public shape of one language (trimmed by buildHexModel later), without adapters of an unknown status', () => {
    const draft = draftOf(sample('architecture.es'), sample('architecture.en'));
    const odd = portAt(draft, 1).common.adapters[0];
    if (odd) odd.common.status = 'otro';
    const architecture = toArchitecture(draft, 'en');
    expect(architecture.core).toEqual({ name: 'Domain', description: 'The business rules, unaware of what sits outside.' });
    expect(architecture.ports.map((port) => [port.id, port.name, port.description, port.adapters.map((adapter) => [adapter.name, adapter.status, adapter.note])])).toEqual([
      ['database', 'Database', 'Where the data is stored.', [['PostgreSQL', 'in-this-api', null], ['MongoDB', 'production', 'Sample note']]],
      ['queue', 'Queues', null, []],
    ]);
  });

  it('extra: violation paths land on the core of each language, the port fields and the adapter fields by their position in that language', () => {
    const es = sample('architecture.es') as Doc;
    const en = JSON.parse(JSON.stringify(sample('architecture.en'))) as Doc;
    // Postgres only in Spanish: «mongodb» is the first English adapter of the port.
    en.ports[0]?.adapters.splice(0, 1);
    const draft = draftOf(es, en);
    const database = portAt(draft, 0);
    const map = mapViolations(architectureModel, draft, [
      { path: 'en.core', code: 'REQUIRED' },
      { path: 'es.core.name', code: 'TOO_LONG' },
      { path: 'es.core.description', code: 'TOO_LONG' },
      { path: 'es.ports[0].name', code: 'REQUIRED' },
      { path: 'en.ports[0].description', code: 'TOO_LONG' },
      { path: 'es.ports[0].id', code: 'DUPLICATE_ID' },
      { path: 'es.ports[0].adapters', code: 'TOO_MANY' },
      { path: 'en.ports[0].adapters[0].note', code: 'TOO_LONG' },
      { path: 'en.ports[0].adapters[0].status', code: 'INVALID_VALUE' },
      { path: 'es.ports[0].adapters[0].id', code: 'INVALID_ID' },
      { path: 'ports[0].adapters[1]', code: 'PARITY_MISMATCH' },
      { path: 'es.ports[0].adapters[9].name', code: 'REQUIRED' },
    ]);
    const where = Object.fromEntries(map.entries.map((entry) => [entry.path, entry.location && { ...entry.location, itemKey: entry.location.itemKey === database.key ? 'database' : entry.location.itemKey }]));
    expect(where).toEqual({
      'en.core': { itemKey: null, scope: 'en', field: 'core' },
      'es.core.name': { itemKey: null, scope: 'es', field: 'core.name' },
      'es.core.description': { itemKey: null, scope: 'es', field: 'core.description' },
      'es.ports[0].name': { itemKey: 'database', scope: 'es', field: 'name' },
      'en.ports[0].description': { itemKey: 'database', scope: 'en', field: 'description' },
      'es.ports[0].id': { itemKey: 'database', scope: 'common', field: 'id' },
      'es.ports[0].adapters': { itemKey: 'database', scope: 'common', field: 'adapters' },
      'en.ports[0].adapters[0].note': { itemKey: 'database', scope: 'en', field: 'adapters.1.note' },
      'en.ports[0].adapters[0].status': { itemKey: 'database', scope: 'common', field: 'adapters.1.status' },
      'es.ports[0].adapters[0].id': { itemKey: 'database', scope: 'common', field: 'adapters.0.id' },
      'ports[0].adapters[1]': { itemKey: 'database', scope: 'common', field: 'adapters.1' },
      'es.ports[0].adapters[9].name': { itemKey: 'database', scope: 'common', field: 'adapters' },
    });
    expect(map.fields['campo-en-core']).toBe('REQUIRED');
    expect(map.fields['campo-es-core-name']).toBe('TOO_LONG');
    expect(architectureModel.fieldLabel('adapters.1.status')).toBe('Estado del adaptador 2');
    expect(architectureModel.fieldLabel('core.name')).toBe('Nombre del núcleo');
    expect(architectureModel.fieldLabel('adapters')).toBe('Adaptadores');
  });
});
