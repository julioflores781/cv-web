import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Fictional builders («Ada Ejemplo») for stored content documents, and the shared validation vectors. */

export interface Vector {
  name: string;
  kind: 'services' | 'projects' | 'architecture';
  document: unknown;
  expected: Array<{ path: string; code: string }>;
}

export interface ParityVector {
  name: string;
  kind: 'services' | 'projects' | 'architecture';
  es: Record<string, unknown> | null;
  en: Record<string, unknown> | null;
  expected: Array<{ path: string; code: string }>;
}

export const VECTORS = JSON.parse(readFileSync(path.resolve(__dirname, '../fixtures/admin-validation-vectors.json'), 'utf8')) as { validation: Vector[]; parity: ParityVector[] };

export const sample = (name: 'services.es' | 'services.en' | 'projects.es' | 'projects.en' | 'architecture.es' | 'architecture.en'): Record<string, unknown> =>
  JSON.parse(readFileSync(path.resolve(__dirname, `../fixtures/admin-samples/${name}.json`), 'utf8')) as Record<string, unknown>;

export const key = (list: ReadonlyArray<{ path: string; code: string }>): string[] => list.map((v) => `${v.path} ${v.code}`).sort();

export const svc = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Servicio ${id}`, summary: 'Resumen ficticio', price: null, ...extra });
export const project = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Proyecto ${id}`, summary: 'Resumen ficticio', relation: 'own', disclosure: 'public', ...extra });
export const adapter = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Adaptador ${id}`, status: 'production', ...extra });
export const port = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Puerto ${id}`, adapters: [adapter(`${id}-a`)], ...extra });
export const range = <T>(count: number, make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));
const IMAGE = (i: number) => ({ key: `site/projects/0000000${i}-0000-4000-8000-000000000000.webp`, alt: `Imagen ${i}`, width: 800, height: 600 });

/** Limit cases the vectors file does not hold (they are generated, not stored): exact bounds pass, one more fails. */
export const LIMIT_CASES: Vector[] = [
  { name: 'services: 30 is fine', kind: 'services', document: { services: range(30, (i) => svc(`s${i}`)) }, expected: [] },
  { name: 'services: 31 is too many', kind: 'services', document: { services: range(31, (i) => svc(`s${i}`)) }, expected: [{ path: 'es.services', code: 'TOO_MANY' }] },
  {
    name: 'services: summary 600 is fine, 601 too long',
    kind: 'services',
    document: { services: [svc('a', { summary: 'a'.repeat(600) }), svc('b', { summary: 'a'.repeat(601) })] },
    expected: [{ path: 'es.services[1].summary', code: 'TOO_LONG' }],
  },
  {
    name: 'services: negative amount, lower-case currency',
    kind: 'services',
    document: { services: [svc('a', { price: { from: -1, currency: 'EUR' } }), svc('b', { price: { from: 10, currency: 'eur' } })] },
    expected: [
      { path: 'es.services[0].price.from', code: 'INVALID_VALUE' },
      { path: 'es.services[1].price.currency', code: 'INVALID_VALUE' },
    ],
  },
  { name: 'projects: 50 is fine', kind: 'projects', document: { projects: range(50, (i) => project(`p${i}`)) }, expected: [] },
  { name: 'projects: 51 is too many', kind: 'projects', document: { projects: range(51, (i) => project(`p${i}`)) }, expected: [{ path: 'es.projects', code: 'TOO_MANY' }] },
  {
    name: 'projects: stack 30x60, highlights 20x400, links 10',
    kind: 'projects',
    document: {
      projects: [
        project('ok', { stack: range(30, () => 'x'.repeat(60)), highlights: range(20, () => 'h'.repeat(400)), links: range(10, (i) => ({ label: `L${i}`, url: 'https://example.test' })) }),
        project('big', { stack: range(31, () => 'x'), highlights: range(21, () => 'h'), links: range(11, () => ({ label: 'L', url: 'https://example.test' })) }),
        project('long', { stack: ['x'.repeat(61)], highlights: ['h'.repeat(401)] }),
      ],
    },
    expected: [
      { path: 'es.projects[1].stack', code: 'TOO_MANY' },
      { path: 'es.projects[1].highlights', code: 'TOO_MANY' },
      { path: 'es.projects[1].links', code: 'TOO_MANY' },
      { path: 'es.projects[2].stack[0]', code: 'TOO_LONG' },
      { path: 'es.projects[2].highlights[0]', code: 'TOO_LONG' },
    ],
  },
  {
    name: 'projects: links with http, spaces and over 300 characters; 10 images fine, alt 201 too long',
    kind: 'projects',
    document: {
      projects: [
        project('l', { links: [{ label: 'A', url: 'http://example.test' }, { label: 'B', url: 'https://exa mple.test' }, { label: 'C', url: `https://example.test/${'a'.repeat(290)}` }] }),
        project('i', { images: range(10, IMAGE) }),
        project('alt', { images: [{ ...IMAGE(1), alt: 'a'.repeat(201) }] }),
      ],
    },
    expected: [
      { path: 'es.projects[0].links[0].url', code: 'INVALID_URL' },
      { path: 'es.projects[0].links[1].url', code: 'INVALID_URL' },
      { path: 'es.projects[0].links[2].url', code: 'INVALID_URL' },
      { path: 'es.projects[2].images[0].alt', code: 'TOO_LONG' },
    ],
  },
  { name: 'architecture: 20 ports fine', kind: 'architecture', document: { core: { name: 'Núcleo' }, ports: range(20, (i) => port(`p${i}`)) }, expected: [] },
  {
    name: 'architecture: 21 ports, 21 adapters, lengths 80/300/200',
    kind: 'architecture',
    document: {
      core: { name: 'n'.repeat(80), description: 'd'.repeat(301) },
      ports: [port('a', { adapters: range(21, (i) => adapter(`x${i}`)) }), port('b', { name: 'n'.repeat(81), description: 'd'.repeat(300), adapters: [adapter('y', { note: 'n'.repeat(201), name: 'n'.repeat(81) })] })],
    },
    expected: [
      { path: 'es.core.description', code: 'TOO_LONG' },
      { path: 'es.ports[0].adapters', code: 'TOO_MANY' },
      { path: 'es.ports[1].name', code: 'TOO_LONG' },
      { path: 'es.ports[1].adapters[0].name', code: 'TOO_LONG' },
      { path: 'es.ports[1].adapters[0].note', code: 'TOO_LONG' },
    ],
  },
  { name: 'architecture: 21 ports', kind: 'architecture', document: { core: { name: 'N' }, ports: range(21, (i) => port(`p${i}`)) }, expected: [{ path: 'es.ports', code: 'TOO_MANY' }] },
  {
    name: 'architecture: same port id twice, same adapter id in two ports is fine',
    kind: 'architecture',
    document: { core: { name: 'N' }, ports: [port('a', { adapters: [adapter('z')] }), port('a', { adapters: [adapter('z')] })] },
    expected: [{ path: 'es.ports[1].id', code: 'DUPLICATE_ID' }],
  },
];
