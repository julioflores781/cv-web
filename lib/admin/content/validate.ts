import type { ContentKind, ViolationEntry } from '@/lib/api/admin';
import { isHttpsUrl, isJavaBlank, javaStrip } from './java-text';

/**
 * Mirror of the API's `ContentValidator` and `ContentParity` (and of the fake in `scripts/parity/admin-fake.mjs`), with the same paths and codes.
 * The API stays the authority; `tests/fixtures/admin-validation-vectors.json` pins both mirrors so they cannot drift (T229, T239).
 * Runs in the browser: no `node:*`, no runtime import of `lib/api`.
 */

export const LIMITS = { services: 30, projects: 50, ports: 20, adapters: 20, images: 10, links: 10, stack: 30, highlights: 20 } as const;
export const MAX_COMMENT = 200;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTH = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/;
const CURRENCY = /^[A-Z]{3}$/;
const IMAGE_KEY = /^site\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|gif)$/;
const RELATIONS = ['own', 'employer'];
const DISCLOSURES = ['public', 'anonymous'];
const ADAPTER_STATUS = ['in-this-api', 'production', 'experiment'];

type Obj = Record<string, unknown>;

const isMap = (value: unknown): value is Obj => typeof value === 'object' && value !== null && !Array.isArray(value);
const isAbsent = (value: unknown): value is null | undefined => value === null || value === undefined;
/** Length in code points, like the API (an emoji counts as one). */
export const codePoints = (text: string): number => [...text].length;
/** Blank as Java sees it (`String.isBlank()`), not as `trim()` does: see `java-text.ts`. */
const isBlank = isJavaBlank;
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** All violations of one language document; `root` (`es`/`en`) prefixes every path. Empty means valid. Never changes the document. */
export function validateDocument(kind: ContentKind, root: string, document: unknown): ViolationEntry[] {
  const out: ViolationEntry[] = [];
  const add = (path: string, code: string): void => void out.push({ path, code });

  const object = (value: unknown, path: string): Obj | null => {
    if (isMap(value)) return value;
    add(path, isAbsent(value) ? 'REQUIRED' : 'INVALID_VALUE');
    return null;
  };
  const unknownFields = (map: Obj, path: string, allowed: readonly string[]): void => {
    for (const key of Object.keys(map)) if (!allowed.includes(key)) add(`${path}.${key}`, 'UNKNOWN_FIELD');
  };
  const items = (value: unknown, path: string, max: number): unknown[] => {
    if (isAbsent(value)) return [];
    if (!Array.isArray(value)) {
      add(path, 'INVALID_VALUE');
      return [];
    }
    if (value.length > max) {
      add(path, 'TOO_MANY');
      return [];
    }
    return value;
  };
  const id = (item: Obj, at: string, seen: Set<string>): void => {
    const value = item.id;
    const path = `${at}.id`;
    if (isAbsent(value)) add(path, 'REQUIRED');
    else if (typeof value !== 'string' || value.length > 64 || !ID.test(value)) add(path, 'INVALID_ID');
    else if (seen.has(value)) add(path, 'DUPLICATE_ID');
    else seen.add(value);
  };
  const text = (item: Obj, at: string, key: string, required: boolean, max: number): void => {
    const value = item[key];
    const path = `${at}.${key}`;
    if (isAbsent(value)) {
      if (required) add(path, 'REQUIRED');
    } else if (typeof value !== 'string') add(path, 'INVALID_VALUE');
    else if (isBlank(value) && required) add(path, 'REQUIRED');
    else if (codePoints(value) > max) add(path, 'TOO_LONG');
  };
  const enumValue = (item: Obj, at: string, key: string, allowed: readonly string[]): string | null => {
    const value = item[key];
    const path = `${at}.${key}`;
    if (isAbsent(value) || (typeof value === 'string' && isBlank(value))) {
      add(path, 'REQUIRED');
      return null;
    }
    if (typeof value === 'string' && allowed.includes(value)) return value;
    add(path, 'INVALID_VALUE');
    return null;
  };
  const strings = (value: unknown, path: string, maxItems: number, maxLength: number): void => {
    items(value, path, maxItems).forEach((item, i) => {
      if (typeof item !== 'string' || isBlank(item)) add(`${path}[${i}]`, 'INVALID_VALUE');
      else if (codePoints(item) > maxLength) add(`${path}[${i}]`, 'TOO_LONG');
    });
  };

  const price = (value: unknown, path: string): void => {
    if (isAbsent(value)) return;
    if (!isMap(value)) return add(path, 'INVALID_VALUE');
    unknownFields(value, path, ['from', 'currency']);
    const from = finite(value.from);
    if (from === null || from < 0 || from > 1_000_000_000) add(`${path}.from`, 'INVALID_VALUE');
    if (typeof value.currency !== 'string' || !CURRENCY.test(value.currency)) add(`${path}.currency`, 'INVALID_VALUE');
  };

  const services = (value: unknown, path: string): void => {
    const ids = new Set<string>();
    items(value, path, LIMITS.services).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const service = object(item, at);
      if (service === null) return;
      unknownFields(service, at, ['id', 'title', 'summary', 'price']);
      id(service, at, ids);
      text(service, at, 'title', true, 120);
      text(service, at, 'summary', true, 600);
      price(service.price, `${at}.price`);
    });
  };

  const month = (value: unknown, path: string): string | null => {
    if (isAbsent(value)) return null;
    if (typeof value !== 'string' || !MONTH.test(value)) {
      add(path, 'INVALID_DATE');
      return null;
    }
    return value;
  };

  const side = (image: Obj, at: string, key: string): void => {
    const value = image[key];
    const path = `${at}.${key}`;
    if (isAbsent(value)) return add(path, 'REQUIRED');
    const number = finite(value);
    if (number === null || !Number.isInteger(number) || number <= 0 || number > 20_000) add(path, 'INVALID_VALUE');
  };

  const images = (value: unknown, path: string, relation: string | null, disclosure: string | null): void => {
    const list = items(value, path, LIMITS.images);
    if (list.length === 0) return;
    if (relation !== 'own' || disclosure !== 'public') return add(path, 'IMAGES_NOT_ALLOWED_FOR_PROJECT');
    list.forEach((item, i) => {
      const at = `${path}[${i}]`;
      const image = object(item, at);
      if (image === null) return;
      unknownFields(image, at, ['key', 'alt', 'width', 'height']);
      if (isAbsent(image.key)) add(`${at}.key`, 'REQUIRED');
      else if (typeof image.key !== 'string' || !IMAGE_KEY.test(image.key)) add(`${at}.key`, 'IMAGE_KEY_INVALID');
      text(image, at, 'alt', true, 200);
      side(image, at, 'width');
      side(image, at, 'height');
    });
  };

  const links = (value: unknown, path: string): void => {
    items(value, path, LIMITS.links).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const link = object(item, at);
      if (link === null) return;
      unknownFields(link, at, ['label', 'url']);
      text(link, at, 'label', true, 80);
      if (isAbsent(link.url)) add(`${at}.url`, 'REQUIRED');
      else if (typeof link.url !== 'string' || !isHttpsUrl(link.url)) add(`${at}.url`, 'INVALID_URL');
    });
  };

  const client = (project: Obj, at: string, relation: string | null, disclosure: string | null): void => {
    const value = project.client;
    const present = !isAbsent(value) && !(typeof value === 'string' && isBlank(value));
    if (disclosure === 'anonymous') {
      if (present) add(`${at}.client`, 'ANONYMOUS_CLIENT_FORBIDDEN');
      return;
    }
    if (disclosure === 'public' && relation === 'employer' && !present) return add(`${at}.client`, 'CLIENT_REQUIRED');
    text(project, at, 'client', false, 160);
  };

  const projects = (value: unknown, path: string): void => {
    const ids = new Set<string>();
    items(value, path, LIMITS.projects).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const project = object(item, at);
      if (project === null) return;
      unknownFields(project, at, ['id', 'title', 'summary', 'relation', 'role', 'disclosure', 'client', 'clientLabel', 'startDate', 'endDate', 'stack', 'highlights', 'links', 'images']);
      id(project, at, ids);
      text(project, at, 'title', true, 160);
      text(project, at, 'summary', true, 800);
      text(project, at, 'role', false, 160);
      text(project, at, 'clientLabel', false, 160);
      const relation = enumValue(project, at, 'relation', RELATIONS);
      const disclosure = enumValue(project, at, 'disclosure', DISCLOSURES);
      client(project, at, relation, disclosure);
      const start = month(project.startDate, `${at}.startDate`);
      const end = month(project.endDate, `${at}.endDate`);
      const startGiven = !isAbsent(project.startDate);
      if (end !== null && (!startGiven || (start !== null && end < start))) add(`${at}.endDate`, 'INVALID_DATE');
      strings(project.stack, `${at}.stack`, LIMITS.stack, 60);
      strings(project.highlights, `${at}.highlights`, LIMITS.highlights, 400);
      links(project.links, `${at}.links`);
      images(project.images, `${at}.images`, relation, disclosure);
    });
  };

  const adapters = (value: unknown, path: string): void => {
    const ids = new Set<string>();
    items(value, path, LIMITS.adapters).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const adapter = object(item, at);
      if (adapter === null) return;
      unknownFields(adapter, at, ['id', 'name', 'status', 'note']);
      id(adapter, at, ids);
      text(adapter, at, 'name', true, 80);
      enumValue(adapter, at, 'status', ADAPTER_STATUS);
      text(adapter, at, 'note', false, 200);
    });
  };

  const architecture = (map: Obj): void => {
    const corePath = `${root}.core`;
    if (isAbsent(map.core)) add(corePath, 'REQUIRED');
    else {
      const core = object(map.core, corePath);
      if (core !== null) {
        unknownFields(core, corePath, ['name', 'description']);
        text(core, corePath, 'name', true, 80);
        text(core, corePath, 'description', false, 300);
      }
    }
    const portsPath = `${root}.ports`;
    const ids = new Set<string>();
    items(map.ports, portsPath, LIMITS.ports).forEach((item, i) => {
      const at = `${portsPath}[${i}]`;
      const port = object(item, at);
      if (port === null) return;
      unknownFields(port, at, ['id', 'name', 'description', 'adapters']);
      id(port, at, ids);
      text(port, at, 'name', true, 80);
      text(port, at, 'description', false, 300);
      adapters(port.adapters, `${at}.adapters`);
    });
  };

  const map = object(document, root);
  if (map === null) return out;
  if (kind === 'services') {
    unknownFields(map, root, ['services']);
    services(map.services, `${root}.services`);
  } else if (kind === 'projects') {
    unknownFields(map, root, ['projects']);
    projects(map.projects, `${root}.projects`);
  } else {
    unknownFields(map, root, ['core', 'ports']);
    architecture(map);
  }
  return out;
}

const list = (value: unknown): Obj[] => (Array.isArray(value) ? value.filter(isMap) : []);
const neutral = (value: unknown): string | null => (isAbsent(value) || isBlank(String(value)) ? null : String(value));
const numeric = (value: unknown): string | null => (typeof value === 'number' ? String(value) : neutral(value));

/** Differences between ES and EN in ids, order and the fields that must not be translated. Paths carry no language prefix. */
export function compareParity(kind: ContentKind, es: Obj | null, en: Obj | null): ViolationEntry[] {
  if (es === null || en === null) {
    if (es === null && en === null) return [];
    return [{ path: es === null ? 'es' : 'en', code: 'PARITY_MISMATCH' }];
  }
  const out: ViolationEntry[] = [];
  const mismatch = (path: string): void => void out.push({ path, code: 'PARITY_MISMATCH' });
  const same = (path: string, a: string | null, b: string | null): void => {
    if (a !== b) mismatch(path);
  };
  const pairs = (path: string, a: Obj[], b: Obj[], inner: (at: string, left: Obj, right: Obj) => void): void => {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const at = `${path}[${i}]`;
      const left = a[i];
      const right = b[i];
      if (left === undefined || right === undefined) mismatch(at);
      else if (left.id !== right.id) mismatch(`${at}.id`);
      else inner(at, left, right);
    }
  };
  const priceOf = (service: Obj): string | null => {
    if (!isMap(service.price)) return null;
    const from = typeof service.price.from === 'number' ? String(service.price.from) : null;
    return `${from} ${String(service.price.currency)}`;
  };
  if (kind === 'services') {
    pairs('services', list(es.services), list(en.services), (at, a, b) => same(`${at}.price`, priceOf(a), priceOf(b)));
  } else if (kind === 'projects') {
    pairs('projects', list(es.projects), list(en.projects), (at, a, b) => {
      for (const field of ['relation', 'disclosure', 'client', 'startDate', 'endDate']) same(`${at}.${field}`, neutral(a[field]), neutral(b[field]));
      const left = list(a.images);
      const right = list(b.images);
      for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
        const path = `${at}.images[${i}]`;
        const x = left[i];
        const y = right[i];
        if (x === undefined || y === undefined) mismatch(path);
        else for (const field of ['key', 'width', 'height']) same(`${path}.${field}`, numeric(x[field]), numeric(y[field]));
      }
    });
  } else {
    pairs('ports', list(es.ports), list(en.ports), (at, a, b) =>
      pairs(`${at}.adapters`, list(a.adapters), list(b.adapters), (adapterAt, x, y) => same(`${adapterAt}.status`, neutral(x.status), neutral(y.status))),
    );
  }
  return out;
}

/** `es.services[10].id` sorts after `es.services[2].title`: indexes compare as numbers, names as text. */
export function comparePaths(a: string, b: string): number {
  const split = (path: string) => path.split(/(\d+)/);
  const left = split(a);
  const right = split(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = left[i] as string;
    const y = right[i] as string;
    if (x === y) continue;
    const numeric = i % 2 === 1;
    return numeric ? Number(x) - Number(y) : x < y ? -1 : 1;
  }
  return left.length - right.length;
}

export interface SaveCandidate {
  comment: string;
  documents: { es: unknown; en: unknown };
}

/** Everything the API would refuse in a save (comment, both documents and, when they are valid, their parity), sorted by path. */
export function validateSave(kind: ContentKind, { comment, documents }: SaveCandidate): ViolationEntry[] {
  const out: ViolationEntry[] = [];
  // Like the API: `strip()`, then code points.
  const trimmed = javaStrip(comment);
  if (trimmed !== '' && codePoints(trimmed) > MAX_COMMENT) out.push({ path: 'comment', code: 'TOO_LONG' });
  out.push(...validateDocument(kind, 'es', documents.es), ...validateDocument(kind, 'en', documents.en));
  if (out.length === 0 && isMap(documents.es) && isMap(documents.en)) out.push(...compareParity(kind, documents.es, documents.en));
  return out.sort((a, b) => comparePaths(a.path, b.path));
}
