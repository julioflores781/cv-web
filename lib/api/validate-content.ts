import type { Architecture, ArchitecturePort, PortAdapter, Project, ProjectLink, Service } from './types';
import { parsePeriod } from './validate';

type Obj = Record<string, unknown>;

const ADAPTER_STATUSES: readonly PortAdapter['status'][] = ['in-this-api', 'production', 'experiment'];

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Optional text: absent and null are valid (normalised to null); a non-string is not (`false`). */
function optText(value: unknown): string | null | false {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : false;
}

function parseAdapter(raw: unknown): PortAdapter | null {
  if (!isObj(raw)) return null;
  const { id, name, status } = raw;
  const note = optText(raw.note);
  if (typeof id !== 'string' || typeof name !== 'string' || note === false) return null;
  // A status the site does not know is invalid: the build must fail early rather than mislabel it.
  const known = ADAPTER_STATUSES.find((candidate) => candidate === status);
  return known === undefined ? null : { id, name, status: known, note };
}

function parsePort(raw: unknown): ArchitecturePort | null {
  if (!isObj(raw)) return null;
  const { id, name } = raw;
  const description = optText(raw.description);
  if (typeof id !== 'string' || typeof name !== 'string' || description === false || !Array.isArray(raw.adapters)) return null;
  const adapters: PortAdapter[] = [];
  for (const item of raw.adapters) {
    const adapter = parseAdapter(item);
    if (adapter === null) return null;
    adapters.push(adapter);
  }
  return { id, name, description, adapters };
}

/** Validates an untrusted `/architecture` payload; unknown fields are dropped. `null` when it is not valid. */
export function parseArchitecture(raw: unknown): Architecture | null {
  if (!isObj(raw) || !isObj(raw.core) || !Array.isArray(raw.ports)) return null;
  const description = optText(raw.core.description);
  // The empty publication of the API is `{core:{name:""}, ports:[]}`, so an empty name is valid.
  if (typeof raw.core.name !== 'string' || description === false) return null;
  const ports: ArchitecturePort[] = [];
  for (const item of raw.ports) {
    const port = parsePort(item);
    if (port === null) return null;
    ports.push(port);
  }
  return { core: { name: raw.core.name, description }, ports };
}

function parsePrice(raw: unknown): Service['price'] | false {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) return false;
  const { from, currency } = raw;
  if (typeof from !== 'number' || !Number.isFinite(from) || from < 0) return false;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return false;
  return { from, currency };
}

function parseService(raw: unknown): Service | null {
  if (!isObj(raw)) return null;
  const { id, title, summary } = raw;
  const price = parsePrice(raw.price);
  if (typeof id !== 'string' || typeof title !== 'string' || typeof summary !== 'string' || price === false) return null;
  return { id, title, summary, price };
}

function parseList<T>(raw: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

/** Validates an untrusted `/services` payload, keeping the API order. An empty list is valid. `null` when it is not. */
export function parseServices(raw: unknown): Service[] | null {
  return parseList(raw, parseService);
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function parseProjectLink(raw: unknown): ProjectLink | null {
  if (!isObj(raw)) return null;
  const label = text(raw.label);
  const url = text(raw.url);
  return label === null || url === null ? null : { label, url };
}

function parseProject(raw: unknown): Project | null {
  if (!isObj(raw)) return null;
  const { id, title, summary, relation, disclosure } = raw;
  const role = optText(raw.role);
  const client = optText(raw.client);
  const clientLabel = optText(raw.clientLabel);
  const stack = raw.stack === undefined ? [] : parseList(raw.stack, text);
  const highlights = raw.highlights === undefined ? [] : parseList(raw.highlights, text);
  const links = raw.links === undefined ? [] : parseList(raw.links, parseProjectLink);
  const period = raw.period === undefined || raw.period === null ? null : parsePeriod(raw.period);
  const periodInvalid = period === null && raw.period !== undefined && raw.period !== null;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof summary !== 'string') return null;
  if (role === false || client === false || clientLabel === false || stack === null || highlights === null || links === null || periodInvalid) {
    return null;
  }
  const knownRelation = relation === 'own' || relation === 'employer' ? relation : null;
  const knownDisclosure = disclosure === 'public' || disclosure === 'anonymous' ? disclosure : null;
  if (knownRelation === null || knownDisclosure === null) return null;
  // Privacy: the real client of an anonymous project never leaves the parser, even if the API sends it.
  return {
    id, title, summary, relation: knownRelation, disclosure: knownDisclosure, role,
    client: knownDisclosure === 'anonymous' ? null : client,
    clientLabel, period, stack, highlights, links,
  };
}

/** Validates an untrusted `/projects` payload, keeping the API order; `anonymous` projects lose their `client`. */
export function parseProjects(raw: unknown): Project[] | null {
  return parseList(raw, parseProject);
}
