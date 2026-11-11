import { describe, expect, it } from 'vitest';
import { LEAKED_CLIENT, architectureEs, projectsEs, servicesEs } from '@/tests/fixtures/content';
import { parseArchitecture, parseProjects, parseServices } from './validate-content';

describe('parseArchitecture', () => {
  it('HX-T9: parses core, ports and adapters in order and normalises absent optionals to null', () => {
    const parsed = parseArchitecture(architectureEs);
    expect(parsed).toEqual(architectureEs);
    expect(parsed?.ports.map((port) => port.id)).toEqual(['database', 'messaging', 'identity']);
    const loose = parseArchitecture({
      core: { name: 'Core' },
      ports: [{ id: 'p', name: 'P', adapters: [{ id: 'a', name: 'A', status: 'production' }] }],
      unknown: 'dropped',
    });
    expect(loose).toEqual({
      core: { name: 'Core', description: null },
      ports: [{ id: 'p', name: 'P', description: null, adapters: [{ id: 'a', name: 'A', status: 'production', note: null }] }],
    });
  });

  it('HX-T10: an unknown status, a core without name or a port without adapters is invalid', () => {
    const port = (adapters: unknown) => ({ core: { name: 'C' }, ports: [{ id: 'p', name: 'P', adapters }] });
    expect(parseArchitecture(port([{ id: 'a', name: 'A', status: 'x' }]))).toBeNull();
    expect(parseArchitecture({ core: {}, ports: [] })).toBeNull();
    expect(parseArchitecture({ ports: [] })).toBeNull();
    expect(parseArchitecture({ core: { name: 'C' }, ports: [{ id: 'p', name: 'P' }] })).toBeNull();
    expect(parseArchitecture(port([{ id: 'a', status: 'production' }]))).toBeNull();
    expect(parseArchitecture(port([{ id: 'a', name: 'A', status: 'production', note: 3 }]))).toBeNull();
  });

  it('HX-T11: an empty list of ports is a valid, empty diagram (also with an empty core name)', () => {
    expect(parseArchitecture({ core: { name: 'C', description: null }, ports: [] })).toEqual({
      core: { name: 'C', description: null },
      ports: [],
    });
    expect(parseArchitecture({ core: { name: '', description: null }, ports: [] })?.ports).toEqual([]);
  });

  it('HX-T12: null, an array where an object goes and an object where an array goes are invalid', () => {
    expect(parseArchitecture(null)).toBeNull();
    expect(parseArchitecture([])).toBeNull();
    expect(parseArchitecture({ core: [], ports: [] })).toBeNull();
    expect(parseArchitecture({ core: { name: 'C' }, ports: {} })).toBeNull();
    expect(parseArchitecture({ core: { name: 'C' }, ports: [{ id: 'p', name: 'P', adapters: {} }] })).toBeNull();
    expect(parseArchitecture({ core: { name: 'C' }, ports: [[]] })).toBeNull();
  });
});

describe('parseServices', () => {
  it('CO-T1: valid services are parsed keeping the API order', () => {
    const parsed = parseServices(servicesEs);
    expect(parsed).toEqual(servicesEs);
    expect(parsed?.map((service) => service.id)).toEqual(['web', 'api', 'audit']);
  });

  it('CO-T2: price null, {from:0} and {from:1500.5} are valid; a negative or textual amount and a malformed currency are not', () => {
    const one = (price: unknown) => parseServices([{ id: 's', title: 'T', summary: 'S', price }]);
    expect(one(null)?.[0]?.price).toBeNull();
    expect(one({ from: 0, currency: 'EUR' })?.[0]?.price).toEqual({ from: 0, currency: 'EUR' });
    expect(one({ from: 1500.5, currency: 'EUR' })?.[0]?.price?.from).toBe(1500.5);
    expect(one({ from: -1, currency: 'EUR' })).toBeNull();
    expect(one({ from: '1', currency: 'EUR' })).toBeNull();
    expect(one({ from: 1, currency: 'eur' })).toBeNull();
    expect(one({ from: 1, currency: 'EURO' })).toBeNull();
    expect(one({ from: Number.POSITIVE_INFINITY, currency: 'EUR' })).toBeNull();
  });

  it('CO-T8: [] is a valid empty list; null and an object instead of a list are invalid (services)', () => {
    expect(parseServices([])).toEqual([]);
    expect(parseServices(null)).toBeNull();
    expect(parseServices({})).toBeNull();
    expect(parseServices([{ id: 's', title: 'T' }])).toBeNull();
  });
});

describe('parseProjects', () => {
  it('CO-T3: valid projects are parsed with all their fields and the API order', () => {
    const parsed = parseProjects(projectsEs);
    expect(parsed).toEqual(projectsEs);
    expect(parsed?.map((project) => project.id)).toEqual(['proyecto-propio', 'proyecto-empresa', 'proyecto-anonimo']);
  });

  it('CO-T4: an unknown relation or disclosure is an invalid response', () => {
    const base = projectsEs[0] as object;
    expect(parseProjects([{ ...base, relation: 'x' }])).toBeNull();
    expect(parseProjects([{ ...base, disclosure: 'x' }])).toBeNull();
  });

  it('CO-T5: the client of an anonymous project does not survive the parser', () => {
    const anonymous = projectsEs[2] as object;
    const parsed = parseProjects([{ ...anonymous, client: LEAKED_CLIENT }]);
    expect(parsed?.[0]?.client).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain(LEAKED_CLIENT);
  });

  it('CO-T6: a public project keeps its client; with client null it stays null', () => {
    const base = projectsEs[1] as object;
    expect(parseProjects([{ ...base, client: 'Cliente Ejemplo S.A.' }])?.[0]?.client).toBe('Cliente Ejemplo S.A.');
    expect(parseProjects([{ ...base, client: null }])?.[0]?.client).toBeNull();
  });

  it('CO-T7: a project without role, period, clientLabel, highlights or links is normalised to null / []', () => {
    const parsed = parseProjects([{ id: 'p', title: 'T', summary: 'S', relation: 'own', disclosure: 'public', stack: ['A'] }]);
    expect(parsed).toEqual([
      { id: 'p', title: 'T', summary: 'S', relation: 'own', disclosure: 'public', role: null, client: null, clientLabel: null, period: null, stack: ['A'], highlights: [], links: [] },
    ]);
  });

  it('CO-T8: [] is a valid empty list; null, an object instead of a list and a broken period are invalid (projects)', () => {
    expect(parseProjects([])).toEqual([]);
    expect(parseProjects(null)).toBeNull();
    expect(parseProjects({})).toBeNull();
    const base = projectsEs[0] as object;
    expect(parseProjects([{ ...base, period: { start: 3 } }])).toBeNull();
    expect(parseProjects([{ ...base, links: [{ label: 'x' }] }])).toBeNull();
  });
});
