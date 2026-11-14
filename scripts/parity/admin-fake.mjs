// Fake of the admin part of the CV API (`/api/v1/admin/*`), plus the public reads of the content it holds.
// The ONE implementation used by the test helper (`tests/helpers/fake-api.ts`) and by `design-api.mjs`. Development and test tool only: it is never
// published, and its data is fictional («Ada Ejemplo»). Types: `admin-fake.d.mts` (this file is deliberately not type-checked).
//
// Contract: `progress/api-admin/analysis.md` §4 and §10 (repo `cv-web`) and the Java sources of the API (repo `cv`). Differences from the real API are
// listed in `progress/web-admin/web-admin-api-client/impl.md` (no global login rate limit; the cap of one body is 96 KiB).
import { createHash, randomUUID } from 'node:crypto';

const KINDS = ['services', 'projects', 'architecture'];
const LANGS = ['es', 'en'];
const MAX_BODY_BYTES = 98_304;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_COMMENT = 200;
const MAX_VIOLATIONS = 200;
const HOUR_MS = 3_600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMAGE_KEY = /^site\/projects\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png|webp|gif)$/;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Content rules: a port of `ContentValidator` and `ContentParity` of the API. `tests/fixtures/admin-validation-vectors.json` pins both.
// ---------------------------------------------------------------------------------------------------------------------------------------------

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTH = /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/;
const CURRENCY = /^[A-Z]{3}$/;
const RELATIONS = ['own', 'employer'];
const DISCLOSURES = ['public', 'anonymous'];
const ADAPTER_STATUS = ['in-this-api', 'production', 'experiment'];
const LIMITS = { services: 30, projects: 50, ports: 20, adapters: 20, images: 10, links: 10, stack: 30, highlights: 20 };

const isMap = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const length = (text) => [...text].length;

// Java's text rules (a copy of `lib/admin/content/java-text.ts`; the shared vectors pin both): blank is `String.isBlank()`, `strip()` uses
// `Character.isWhitespace`, and an https link is what `new java.net.URI(text)` accepts with scheme `https` and a non-null host.
const isJavaWhitespace = (code) =>
  (code >= 0x09 && code <= 0x0d) || (code >= 0x1c && code <= 0x20) || code === 0x1680 || (code >= 0x2000 && code <= 0x2006) ||
  (code >= 0x2008 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x205f || code === 0x3000;
const isBlank = (text) => {
  for (let i = 0; i < text.length; i += 1) if (!isJavaWhitespace(text.charCodeAt(i))) return false;
  return true;
};
const strip = (text) => {
  let start = 0;
  let end = text.length;
  while (start < end && isJavaWhitespace(text.charCodeAt(start))) start += 1;
  while (end > start && isJavaWhitespace(text.charCodeAt(end - 1))) end -= 1;
  return text.slice(start, end);
};
const URI_ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const URI_UNRESERVED = `${URI_ALPHA}0123456789-_.!~*'()`;
const URI_SCHEME = `${URI_ALPHA}0123456789+-.`;
const URI_USERINFO = `${URI_UNRESERVED};:&=+$,`;
const URI_PATH = `${URI_UNRESERVED}:@&=+$,;/`;
const URI_URIC = `${URI_UNRESERVED};/?:@&=+$,[]`;
const HEX_DIGIT = /^[0-9A-Fa-f]$/;
const isSpaceChar = (code) => code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000;
const uriLegal = (text, allowed) => {
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (allowed.includes(char)) continue;
    if (char === '%') {
      if (!HEX_DIGIT.test(text[i + 1] ?? '') || !HEX_DIGIT.test(text[i + 2] ?? '')) return false;
      i += 2;
      continue;
    }
    if (code > 128 && !isSpaceChar(code) && !(code <= 0x1f || (code >= 0x7f && code <= 0x9f))) continue;
    return false;
  }
  return true;
};
const ipv4 = (text) => {
  const parts = text.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};
const ipv6 = (text) => {
  const percent = text.indexOf('%');
  if (percent >= 0) return /^[A-Za-z0-9_.]+$/.test(text.slice(percent + 1)) && ipv6(text.slice(0, percent));
  let body = text;
  let extra = 0;
  const tail = /(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(body);
  if (tail) {
    if (!ipv4(tail[1])) return false;
    body = body.slice(0, body.length - tail[1].length);
    if (body.endsWith(':') && !body.endsWith('::')) body = body.slice(0, -1);
    extra = 2;
  }
  const halves = body.split('::');
  if (halves.length > 2) return false;
  const groups = (part) => {
    if (part === '') return [];
    const list = part.split(':');
    return list.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group)) ? list : null;
  };
  const left = groups(halves[0]);
  const right = halves.length === 2 ? groups(halves[1]) : [];
  if (left === null || right === null) return false;
  const count = left.length + right.length + extra;
  return halves.length === 2 ? count <= 7 : count === 8;
};
const hostname = (text) => {
  const trimmed = text.endsWith('.') ? text.slice(0, -1) : text;
  if (trimmed === '') return false;
  const labels = trimmed.split('.');
  if (!labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return false;
  return labels.length === 1 || URI_ALPHA.includes(labels.at(-1)[0]);
};
const serverHost = (authority) => {
  let rest = authority;
  const at = rest.indexOf('@');
  if (at >= 0) {
    if (!uriLegal(rest.slice(0, at), URI_USERINFO)) return null;
    rest = rest.slice(at + 1);
  }
  let host;
  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0 || !ipv6(rest.slice(1, close))) return null;
    host = rest.slice(0, close + 1);
    rest = rest.slice(close + 1);
  } else {
    const colon = rest.indexOf(':');
    host = colon < 0 ? rest : rest.slice(0, colon);
    rest = colon < 0 ? '' : rest.slice(colon);
    if (!ipv4(host) && !hostname(host)) return null;
  }
  if (rest !== '') {
    const port = rest.slice(1);
    if (!rest.startsWith(':') || !/^\d*$/.test(port) || (port !== '' && Number(port) > 2_147_483_647)) return null;
  }
  return host;
};
const isHttpsUrl = (text) => {
  if (text.length > 300 || [...text].some((char) => isJavaWhitespace(char.charCodeAt(0)))) return false;
  const hash = text.indexOf('#');
  const main = hash < 0 ? text : text.slice(0, hash);
  if (hash >= 0 && !uriLegal(text.slice(hash + 1), URI_URIC)) return false;
  const colon = main.search(/[:/?]/);
  if (colon <= 0 || main[colon] !== ':') return false;
  const scheme = main.slice(0, colon);
  if (!URI_ALPHA.includes(scheme[0]) || ![...scheme].every((char) => URI_SCHEME.includes(char)) || scheme.toLowerCase() !== 'https') return false;
  const rest = main.slice(colon + 1);
  if (!rest.startsWith('//')) return false;
  const end = rest.slice(2).search(/[/?]/);
  const authority = end < 0 ? rest.slice(2) : rest.slice(2, end + 2);
  const after = end < 0 ? '' : rest.slice(end + 2);
  if (authority === '' || serverHost(authority) === null) return false;
  const question = after.indexOf('?');
  return uriLegal(question < 0 ? after : after.slice(0, question), URI_PATH) && uriLegal(question < 0 ? '' : after.slice(question + 1), URI_URIC);
};

/**
 * All violations of one language document; `root` prefixes every path (`es`). Empty means valid.
 * @param {string} kind
 * @param {string} root
 * @param {unknown} document
 * @returns {{ path: string, code: string }[]}
 */
export function validateDocument(kind, root, document) {
  const violations = [];
  const add = (path, code) => violations.push({ path, code });

  const object = (value, path) => {
    if (isMap(value)) return value;
    add(path, value === null || value === undefined ? 'REQUIRED' : 'INVALID_VALUE');
    return null;
  };
  const unknown = (map, path, ...allowed) => {
    for (const key of Object.keys(map)) if (!allowed.includes(key)) add(`${path}.${key}`, 'UNKNOWN_FIELD');
  };
  const items = (value, path, max) => {
    if (value === null || value === undefined) return [];
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
  const id = (item, at, seen) => {
    const value = item.id;
    const path = `${at}.id`;
    if (value === null || value === undefined) add(path, 'REQUIRED');
    else if (typeof value !== 'string' || value.length > 64 || !ID.test(value)) add(path, 'INVALID_ID');
    else if (seen.has(value)) add(path, 'DUPLICATE_ID');
    else seen.add(value);
  };
  const text = (item, at, key, required, max) => {
    const value = item[key];
    const path = `${at}.${key}`;
    if (value === null || value === undefined) {
      if (required) add(path, 'REQUIRED');
    } else if (typeof value !== 'string') add(path, 'INVALID_VALUE');
    else if (isBlank(value) && required) add(path, 'REQUIRED');
    else if (length(value) > max) add(path, 'TOO_LONG');
  };
  const enumValue = (item, at, key, allowed) => {
    const value = item[key];
    const path = `${at}.${key}`;
    if (value === null || value === undefined || (typeof value === 'string' && isBlank(value))) {
      add(path, 'REQUIRED');
      return null;
    }
    if (typeof value === 'string' && allowed.includes(value)) return value;
    add(path, 'INVALID_VALUE');
    return null;
  };
  const strings = (value, path, maxItems, maxLength) => {
    items(value, path, maxItems).forEach((item, i) => {
      if (typeof item !== 'string' || isBlank(item)) add(`${path}[${i}]`, 'INVALID_VALUE');
      else if (length(item) > maxLength) add(`${path}[${i}]`, 'TOO_LONG');
    });
  };
  const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

  const price = (value, path) => {
    if (value === null || value === undefined) return;
    if (!isMap(value)) return add(path, 'INVALID_VALUE');
    unknown(value, path, 'from', 'currency');
    const from = finite(value.from);
    if (from === null || from < 0 || from > 1_000_000_000) add(`${path}.from`, 'INVALID_VALUE');
    if (typeof value.currency !== 'string' || !CURRENCY.test(value.currency)) add(`${path}.currency`, 'INVALID_VALUE');
  };

  const services = (value, path) => {
    const ids = new Set();
    items(value, path, LIMITS.services).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const service = object(item, at);
      if (service === null) return;
      unknown(service, at, 'id', 'title', 'summary', 'price');
      id(service, at, ids);
      text(service, at, 'title', true, 120);
      text(service, at, 'summary', true, 600);
      price(service.price, `${at}.price`);
    });
  };

  const month = (value, path) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' || !MONTH.test(value)) {
      add(path, 'INVALID_DATE');
      return null;
    }
    return value;
  };

  const side = (image, at, key) => {
    const value = image[key];
    const path = `${at}.${key}`;
    if (value === null || value === undefined) return add(path, 'REQUIRED');
    const number = finite(value);
    if (number === null || !Number.isInteger(number) || number <= 0 || number > 20_000) add(path, 'INVALID_VALUE');
  };

  const images = (value, path, relation, disclosure) => {
    const list = items(value, path, LIMITS.images);
    if (list.length === 0) return;
    if (relation !== 'own' || disclosure !== 'public') return add(path, 'IMAGES_NOT_ALLOWED_FOR_PROJECT');
    list.forEach((item, i) => {
      const at = `${path}[${i}]`;
      const image = object(item, at);
      if (image === null) return;
      unknown(image, at, 'key', 'alt', 'width', 'height');
      if (image.key === null || image.key === undefined) add(`${at}.key`, 'REQUIRED');
      else if (typeof image.key !== 'string' || !IMAGE_KEY.test(image.key)) add(`${at}.key`, 'IMAGE_KEY_INVALID');
      text(image, at, 'alt', true, 200);
      side(image, at, 'width');
      side(image, at, 'height');
    });
  };

  const links = (value, path) => {
    items(value, path, LIMITS.links).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const link = object(item, at);
      if (link === null) return;
      unknown(link, at, 'label', 'url');
      text(link, at, 'label', true, 80);
      if (link.url === null || link.url === undefined) add(`${at}.url`, 'REQUIRED');
      else if (typeof link.url !== 'string' || !isHttpsUrl(link.url)) add(`${at}.url`, 'INVALID_URL');
    });
  };

  const client = (project, at, relation, disclosure) => {
    const value = project.client;
    const present = value !== null && value !== undefined && !(typeof value === 'string' && isBlank(value));
    if (disclosure === 'anonymous') {
      if (present) add(`${at}.client`, 'ANONYMOUS_CLIENT_FORBIDDEN');
      return;
    }
    if (disclosure === 'public' && relation === 'employer' && !present) return add(`${at}.client`, 'CLIENT_REQUIRED');
    text(project, at, 'client', false, 160);
  };

  const projects = (value, path) => {
    const ids = new Set();
    items(value, path, LIMITS.projects).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const project = object(item, at);
      if (project === null) return;
      unknown(project, at, 'id', 'title', 'summary', 'relation', 'role', 'disclosure', 'client', 'clientLabel', 'startDate', 'endDate', 'stack', 'highlights', 'links', 'images');
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
      const startGiven = project.startDate !== null && project.startDate !== undefined;
      if (end !== null && (!startGiven || (start !== null && end < start))) add(`${at}.endDate`, 'INVALID_DATE');
      strings(project.stack, `${at}.stack`, LIMITS.stack, 60);
      strings(project.highlights, `${at}.highlights`, LIMITS.highlights, 400);
      links(project.links, `${at}.links`);
      images(project.images, `${at}.images`, relation, disclosure);
    });
  };

  const adapters = (value, path) => {
    const ids = new Set();
    items(value, path, LIMITS.adapters).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const adapter = object(item, at);
      if (adapter === null) return;
      unknown(adapter, at, 'id', 'name', 'status', 'note');
      id(adapter, at, ids);
      text(adapter, at, 'name', true, 80);
      enumValue(adapter, at, 'status', ADAPTER_STATUS);
      text(adapter, at, 'note', false, 200);
    });
  };

  const architecture = (map) => {
    const corePath = `${root}.core`;
    if (map.core === null || map.core === undefined) add(corePath, 'REQUIRED');
    else {
      const core = object(map.core, corePath);
      if (core !== null) {
        unknown(core, corePath, 'name', 'description');
        text(core, corePath, 'name', true, 80);
        text(core, corePath, 'description', false, 300);
      }
    }
    const portsPath = `${root}.ports`;
    const ids = new Set();
    items(map.ports, portsPath, LIMITS.ports).forEach((item, i) => {
      const at = `${portsPath}[${i}]`;
      const port = object(item, at);
      if (port === null) return;
      unknown(port, at, 'id', 'name', 'description', 'adapters');
      id(port, at, ids);
      text(port, at, 'name', true, 80);
      text(port, at, 'description', false, 300);
      adapters(port.adapters, `${at}.adapters`);
    });
  };

  const map = object(document, root);
  if (map === null) return violations;
  if (kind === 'services') {
    unknown(map, root, 'services');
    services(map.services, `${root}.services`);
  } else if (kind === 'projects') {
    unknown(map, root, 'projects');
    projects(map.projects, `${root}.projects`);
  } else {
    unknown(map, root, 'core', 'ports');
    architecture(map);
  }
  return violations;
}

const list = (value) => (Array.isArray(value) ? value.filter(isMap) : []);
const neutral = (value) => (value === null || value === undefined || isBlank(String(value)) ? null : String(value));
const numeric = (value) => (typeof value === 'number' ? String(value) : neutral(value));

/**
 * Differences in the neutral fields and the ids of ES and EN (paths without a language prefix). Empty means parity.
 * @param {string} kind
 * @param {Record<string, unknown> | null} es
 * @param {Record<string, unknown> | null} en
 * @returns {{ path: string, code: string }[]}
 */
export function compareParity(kind, es, en) {
  if (es === null || en === null) {
    if (es === null && en === null) return [];
    return [{ path: es === null ? 'es' : 'en', code: 'PARITY_MISMATCH' }];
  }
  const differences = [];
  const same = (path, a, b) => {
    if (a !== b) differences.push({ path, code: 'PARITY_MISMATCH' });
  };
  const pairs = (path, a, b, inner) => {
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      const at = `${path}[${i}]`;
      const left = a[i];
      const right = b[i];
      if (left === undefined || right === undefined) differences.push({ path: at, code: 'PARITY_MISMATCH' });
      else if (left.id !== right.id) differences.push({ path: `${at}.id`, code: 'PARITY_MISMATCH' });
      else inner(at, left, right);
    }
  };
  const priceOf = (service) => {
    if (!isMap(service.price)) return null;
    const from = typeof service.price.from === 'number' ? String(service.price.from) : null;
    return `${from} ${service.price.currency}`;
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
        if (x === undefined || y === undefined) differences.push({ path, code: 'PARITY_MISMATCH' });
        else for (const field of ['key', 'width', 'height']) same(`${path}.${field}`, numeric(x[field]), numeric(y[field]));
      }
    });
  } else {
    pairs('ports', list(es.ports), list(en.ports), (at, a, b) =>
      pairs(`${at}.adapters`, list(a.adapters), list(b.adapters), (adapterAt, x, y) => same(`${adapterAt}.status`, neutral(x.status), neutral(y.status))),
    );
  }
  return differences;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Public shape of the stored documents (what `GET /api/v1/{services,projects,architecture}` serves).
// ---------------------------------------------------------------------------------------------------------------------------------------------

/**
 * @param {string} kind
 * @param {Record<string, unknown>} document stored form
 * @param {string} mediaBase public base of the image bucket
 */
export function toPublic(kind, document, mediaBase) {
  if (kind === 'services') return list(document.services).map((service) => ({ ...service, price: service.price ?? null }));
  if (kind === 'architecture') return document;
  return list(document.projects).map(({ startDate, endDate, images, client, ...project }) => ({
    ...project,
    ...(project.disclosure === 'public' && client !== undefined ? { client } : {}),
    period: startDate ? { start: startDate, ...(endDate ? { end: endDate } : {}), current: !endDate } : null,
    images: list(images).map((image) => ({ url: `${mediaBase}/${image.key}`, alt: image.alt, width: image.width, height: image.height })),
  }));
}

/**
 * Stored form of a public body (used to seed the admin store from the design data).
 * @param {string} kind
 * @param {unknown} body
 * @returns {Record<string, unknown>}
 */
export function fromPublic(kind, body) {
  if (kind === 'services') return { services: body };
  if (kind === 'architecture') return /** @type {Record<string, unknown>} */ (body);
  return {
    projects: list(body).map(({ period, ...project }) => ({
      ...project,
      ...(isMap(period) && period.start ? { startDate: period.start } : {}),
      ...(isMap(period) && period.end ? { endDate: period.end } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Images: format by magic bytes and dimensions from the header.
// ---------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Port of `ImageFormat.detect` + `isKnownUnsupported` of the API: fewer than 12 bytes is no format; another known image type (SVG anywhere in
 * the first 1024 bytes, HEIC/AVIF brands, BMP, TIFF, ICO) is `unsupported` (415); anything else `null` (400).
 * @param {Buffer} data
 */
function sniff(data) {
  const starts = (...bytes) => bytes.every((byte, i) => data[i] === byte);
  const ascii = (from, to) => data.subarray(from, to).toString('latin1');
  if (data.length >= 12) {
    if (starts(0xff, 0xd8, 0xff)) return { ext: 'jpg', type: 'image/jpeg' };
    if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: 'png', type: 'image/png' };
    if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return { ext: 'gif', type: 'image/gif' };
    if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  }
  if (data.length < 4) return null;
  if (ascii(0, 2) === 'BM' || starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a) || starts(0x00, 0x00, 0x01, 0x00)) return { unsupported: true };
  if (data.length >= 12 && ascii(4, 8) === 'ftyp' && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis'].includes(ascii(8, 12).toLowerCase())) return { unsupported: true };
  if (data.subarray(0, 1024).toString('utf8').toLowerCase().includes('<svg')) return { unsupported: true };
  return null;
}

/** @param {Buffer} data @param {string} ext */
function dimensions(data, ext) {
  try {
    if (ext === 'png') return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    if (ext === 'gif') return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
    if (ext === 'webp') {
      const chunk = data.toString('latin1', 12, 16);
      if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3) };
      if (chunk === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const bits = data.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }
    let at = 2; // JPEG: walk the segments until a start-of-frame marker
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) return null;
      const marker = data[at + 1] ?? 0;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
      at += 2 + data.readUInt16BE(at + 2);
    }
  } catch {
    // A truncated header: not an image.
  }
  return null;
}

/** Parts of a multipart body: `{name, data}`. Tolerates only what the web sends (CRLF framing). @param {Buffer} body @param {string} boundary */
function multipartParts(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let at = body.indexOf(delimiter);
  while (at !== -1) {
    const start = at + delimiter.length;
    if (body.subarray(start, start + 2).toString() === '--') break;
    const next = body.indexOf(delimiter, start);
    if (next === -1) break;
    const raw = body.subarray(start + 2, next - 2); // drop the CRLF after the delimiter and the CRLF before the next one
    const split = raw.indexOf('\r\n\r\n');
    if (split !== -1) {
      const headers = raw.subarray(0, split).toString('latin1');
      parts.push({ name: /\bname="([^"]*)"/.exec(headers)?.[1] ?? '', filename: /\bfilename="([^"]*)"/.exec(headers)?.[1] ?? null, data: raw.subarray(split + 4) });
    }
    at = next;
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The fake.
// ---------------------------------------------------------------------------------------------------------------------------------------------

const PROBLEM_TITLES = {
  ADMIN_UNAUTHORIZED: 'No autorizado',
  ADMIN_INVALID_CREDENTIALS: 'Credenciales no válidas',
  ADMIN_LOGIN_LOCKED: 'Acceso bloqueado temporalmente',
  ADMIN_CURRENT_PASSWORD_WRONG: 'La contraseña actual no es correcta',
  ADMIN_WEAK_PASSWORD: 'Contraseña débil',
  BAD_REQUEST: 'Petición no válida',
  NOT_FOUND: 'No encontrado',
  CONTENT_VERSION_NOT_FOUND: 'Versión no encontrada',
  CONTENT_VERSION_CONFLICT: 'El contenido cambió',
  CONTENT_INVALID: 'Contenido no válido',
  CONTENT_PARITY_BROKEN: 'ES y EN no tienen la misma estructura',
  CONTENT_TOO_LARGE: 'Contenido demasiado grande',
  IMAGE_INVALID: 'Imagen no válida',
  IMAGE_TOO_LARGE: 'Imagen demasiado grande',
  IMAGE_UNSUPPORTED_TYPE: 'Tipo de imagen no admitido',
  IMAGE_STORAGE_UNAVAILABLE: 'Almacenamiento de imágenes no disponible',
  IMAGE_NOT_FOUND: 'Imagen no encontrada',
  IMAGE_IN_USE: 'La imagen está en uso',
  UNEXPECTED: 'Error inesperado',
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = (ms) => new Date(ms).toISOString();

const LONG_MAX = 9223372036854775807n;

/**
 * A query parameter read the way Java's `parseInt`/`parseLong` do (optional sign, decimal digits, nothing else), inside `min..max`.
 * Absent gives `fallback`; anything else gives `undefined` (a 400).
 * @param {string | null} raw @param {bigint} min @param {bigint} max @param {bigint | null} fallback
 */
function javaInteger(raw, min, max, fallback) {
  if (raw === null) return fallback;
  if (!/^[+-]?\d{1,40}$/.test(raw)) return undefined;
  const value = BigInt(raw);
  return value >= min && value <= max ? value : undefined;
}

const SAMPLE_MESSAGES = [
  { id: 3, name: 'Ada Ejemplo', email: 'ada@example.test', body: 'Hola, es un mensaje ficticio.', createdAt: '2026-11-03T10:00:00Z', ipHash: 'HASH-SENTINEL-3' },
  { id: 2, name: 'Grace Ejemplo', email: 'grace@example.test', body: 'Otro mensaje ficticio.', createdAt: '2026-11-02T10:00:00Z', ipHash: 'HASH-SENTINEL-2' },
  { id: 1, name: 'Alan Ejemplo', email: 'alan@example.test', body: 'El primero, ficticio.', createdAt: '2026-11-01T10:00:00Z', ipHash: 'HASH-SENTINEL-1' },
];

/**
 * @param {{
 *   adminPassword?: string,
 *   clock?: () => number,
 *   storage?: boolean,
 *   mediaBase?: string,
 *   seed?: Record<string, Record<string, Record<string, unknown>>>,
 *   messages?: Array<Record<string, unknown>>,
 *   maxFailures?: number,
 *   lockMs?: number,
 *   sessionMs?: number,
 * }} [options]
 */
export function createAdminFake(options = {}) {
  const clock = options.clock ?? Date.now;
  const mediaBase = (options.mediaBase ?? 'https://media.example.test').replace(/\/+$/, '');
  const maxFailures = options.maxFailures ?? 5;
  const lockMs = options.lockMs ?? 15 * 60_000;
  const sessionMs = options.sessionMs ?? 8 * HOUR_MS;

  const state = {
    passphrase: options.adminPassword ?? 'una frase larga y secreta',
    sessionVersion: 1,
    passwordChangedAt: clock(),
    failures: 0,
    lockedUntil: 0,
    storage: options.storage ?? true,
    /** Every admin request seen: `{method, path, headers}`. */
    received: [],
    tokens: new Map(),
    /** kind -> lang -> { versions: [{version, publishedAt, source, comment, content}], active: number } */
    content: new Map(),
    /** uuid -> {key, id, ext, contentType, bytes, width, height, lastModified} */
    images: new Map(),
    messages: (options.messages ?? SAMPLE_MESSAGES).map((message) => ({ ...message })),
    faults: new Map(),
  };

  for (const kind of KINDS) state.content.set(kind, { es: { versions: [], active: 0 }, en: { versions: [], active: 0 } });
  for (const [kind, byLang] of Object.entries(options.seed ?? {})) {
    for (const lang of LANGS) {
      const document = byLang[lang];
      if (document === undefined) continue;
      state.content.get(kind)[lang] = { versions: [{ version: 1, publishedAt: clock(), source: 'seed', comment: null, content: structuredClone(document) }], active: 1 };
    }
  }

  const slot = (kind, lang) => state.content.get(kind)[lang];
  const activeOf = (kind, lang) => {
    const { versions, active } = slot(kind, lang);
    return versions.find((entry) => entry.version === active) ?? null;
  };
  const referenced = (key) => {
    for (const byLang of state.content.values()) {
      for (const lang of LANGS) {
        for (const entry of byLang[lang].versions) if (list(entry.content.projects).some((project) => list(project.images).some((image) => image.key === key))) return true;
      }
    }
    return false;
  };

  const languageBody = (kind, lang) => {
    const entry = activeOf(kind, lang);
    return entry === null
      ? { version: 0, publishedAt: null, source: null, comment: null, content: null }
      : { version: entry.version, publishedAt: iso(entry.publishedAt), source: entry.source, comment: entry.comment, content: structuredClone(entry.content) };
  };
  const contentBody = (kind) => {
    const es = activeOf(kind, 'es')?.content ?? null;
    const en = activeOf(kind, 'en')?.content ?? null;
    const differences = compareParity(kind, es, en);
    return { kind, languages: { es: languageBody(kind, 'es'), en: languageBody(kind, 'en') }, parity: { ok: differences.length === 0, differences } };
  };

  // ---- responses -----------------------------------------------------------------------------------------------------------------------------
  const send = (ctx, status, body, extra = {}) => {
    const empty = body === undefined;
    ctx.res.writeHead(status, {
      'Content-Type': extra.type ?? (status >= 400 ? 'application/problem+json' : 'application/json'),
      'Cache-Control': 'no-store',
      ...(ctx.requestId ? { 'X-Request-Id': ctx.requestId } : {}),
      ...extra.headers,
    });
    ctx.res.end(empty ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
  };
  const problem = (ctx, status, code, errors, headers) =>
    send(ctx, status, { type: 'about:blank', title: PROBLEM_TITLES[code] ?? code, status, code, detail: PROBLEM_TITLES[code] ?? code, ...(errors ? { errors: errors.slice(0, MAX_VIOLATIONS) } : {}) }, { headers });

  const jsonBody = (ctx) => {
    try {
      const parsed = JSON.parse(ctx.body.toString('utf8'));
      return isMap(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  const isCount = (value) => Number.isInteger(value) && value >= 0;
  const INT_MAX = 2_147_483_647;
  /** A Java `int` parameter as JAX-RS converts it (`Integer.valueOf`): an optional sign and digits within the int range; `null` otherwise. */
  const javaInt = (raw) => {
    if (typeof raw !== 'string' || !/^[+-]?\d+$/.test(raw)) return null;
    const value = Number(raw);
    return value >= -INT_MAX - 1 && value <= INT_MAX ? value : null;
  };

  // ---- sessions ------------------------------------------------------------------------------------------------------------------------------
  const issueToken = () => {
    const expiresAt = clock() + sessionMs;
    const token = `fake.${state.sessionVersion}.${randomUUID().replaceAll('-', '')}`;
    state.tokens.set(token, { sv: state.sessionVersion, expiresAt });
    return { accessToken: token, tokenType: 'Bearer', expiresAt: iso(expiresAt) };
  };
  const authorized = (ctx) => {
    const header = ctx.req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const entry = state.tokens.get(token);
    return entry !== undefined && entry.sv === state.sessionVersion && entry.expiresAt > clock() ? entry : null;
  };
  const registerFailure = () => {
    state.failures += 1;
    if (state.failures >= maxFailures) state.lockedUntil = clock() + lockMs;
  };
  const lockedFor = () => (state.lockedUntil > clock() ? Math.ceil((state.lockedUntil - clock()) / 1000) : 0);

  // ---- operations ----------------------------------------------------------------------------------------------------------------------------
  const operations = {
    login(ctx) {
      const body = jsonBody(ctx);
      if (body === null || typeof body.password !== 'string') return problem(ctx, 400, 'BAD_REQUEST');
      const retry = lockedFor();
      if (retry > 0) return problem(ctx, 429, 'ADMIN_LOGIN_LOCKED', undefined, { 'Retry-After': String(retry) });
      if (body.password !== state.passphrase) {
        registerFailure();
        return problem(ctx, 401, 'ADMIN_INVALID_CREDENTIALS');
      }
      state.failures = 0;
      state.lockedUntil = 0;
      return send(ctx, 200, issueToken());
    },
    session(ctx, entry) {
      return send(ctx, 200, { authenticated: true, expiresAt: iso(entry.expiresAt), passwordChangedAt: iso(state.passwordChangedAt) });
    },
    password(ctx) {
      const body = jsonBody(ctx);
      if (body === null || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') return problem(ctx, 400, 'BAD_REQUEST');
      const retry = lockedFor();
      if (retry > 0) return problem(ctx, 429, 'ADMIN_LOGIN_LOCKED', undefined, { 'Retry-After': String(retry) });
      if (body.currentPassword !== state.passphrase) {
        registerFailure();
        return problem(ctx, 403, 'ADMIN_CURRENT_PASSWORD_WRONG');
      }
      const next = body.newPassword;
      if (length(next) < 12 || length(next) > 128 || next === state.passphrase) return problem(ctx, 422, 'ADMIN_WEAK_PASSWORD');
      state.passphrase = next;
      state.passwordChangedAt = clock();
      state.sessionVersion += 1;
      state.failures = 0;
      return send(ctx, 200, issueToken());
    },
    'logout-all': (ctx) => {
      state.sessionVersion += 1;
      return send(ctx, 204, undefined);
    },
    'content.get': (ctx) => (KINDS.includes(ctx.params.kind) ? send(ctx, 200, contentBody(ctx.params.kind)) : problem(ctx, 404, 'NOT_FOUND')),
    'content.save': (ctx) => {
      const { kind } = ctx.params;
      if (!KINDS.includes(kind)) return problem(ctx, 404, 'NOT_FOUND');
      if (ctx.body.length > MAX_BODY_BYTES) return problem(ctx, 413, 'CONTENT_TOO_LARGE');
      const body = jsonBody(ctx);
      const bases = body?.baseVersions;
      const documents = body?.documents;
      const shapeOk =
        body !== null &&
        Object.keys(body).every((key) => ['baseVersions', 'comment', 'documents'].includes(key)) &&
        isMap(bases) && isCount(bases.es) && isCount(bases.en) &&
        isMap(documents) && isMap(documents.es) && isMap(documents.en) &&
        (body.comment === undefined || body.comment === null || typeof body.comment === 'string');
      if (!shapeOk) return problem(ctx, 400, 'BAD_REQUEST');
      const comment = typeof body.comment === 'string' && !isBlank(body.comment) ? strip(body.comment) : null;
      const violations = [];
      if (comment !== null && length(comment) > MAX_COMMENT) violations.push({ path: 'comment', code: 'TOO_LONG' });
      violations.push(...validateDocument(kind, 'es', documents.es), ...validateDocument(kind, 'en', documents.en));
      if (violations.length > 0) return problem(ctx, 422, 'CONTENT_INVALID', violations);
      const differences = compareParity(kind, documents.es, documents.en);
      if (differences.length > 0) return problem(ctx, 422, 'CONTENT_PARITY_BROKEN', differences);
      // All or nothing: both bases are checked before anything is published.
      if (LANGS.some((lang) => bases[lang] !== slot(kind, lang).active)) return problem(ctx, 409, 'CONTENT_VERSION_CONFLICT');
      const publishedAt = clock();
      for (const lang of LANGS) {
        const target = slot(kind, lang);
        const version = target.versions.reduce((max, entry) => Math.max(max, entry.version), 0) + 1;
        target.versions.push({ version, publishedAt, source: 'admin', comment, content: structuredClone(documents[lang]) });
        target.active = version;
      }
      return send(ctx, 200, contentBody(kind));
    },
    'versions.list': (ctx) => {
      const { kind, lang } = ctx.params;
      if (!KINDS.includes(kind) || !LANGS.includes(lang)) return problem(ctx, 404, 'NOT_FOUND');
      // Like the real API (`ListContentVersionsService`): a number out of range is clamped to 1-200. `@QueryParam int limit`: a value JAX-RS
      // cannot convert is a 404 `NOT_FOUND` (same inference as `olderThanHours` of the cleanup; not run against the API).
      const requested = ctx.query.has('limit') ? javaInt(ctx.query.get('limit')) : 50;
      if (requested === null) return problem(ctx, 404, 'NOT_FOUND');
      const limit = Math.max(1, Math.min(requested, 200));
      const { versions, active } = slot(kind, lang);
      const rows = [...versions]
        .sort((a, b) => b.version - a.version)
        .slice(0, limit)
        .map((entry) => ({ version: entry.version, active: entry.version === active, publishedAt: iso(entry.publishedAt), source: entry.source, comment: entry.comment }));
      return send(ctx, 200, { kind, lang, versions: rows });
    },
    'versions.get': (ctx) => {
      const { kind, lang } = ctx.params;
      if (!KINDS.includes(kind) || !LANGS.includes(lang)) return problem(ctx, 404, 'NOT_FOUND');
      // `@PathParam int version`: a segment JAX-RS cannot convert is a 404 `NOT_FOUND`; `007` is version 7.
      const wanted = javaInt(ctx.params.version);
      if (wanted === null) return problem(ctx, 404, 'NOT_FOUND');
      const target = slot(kind, lang);
      const entry = target.versions.find((candidate) => candidate.version === wanted);
      if (!entry) return problem(ctx, 404, 'CONTENT_VERSION_NOT_FOUND');
      return send(ctx, 200, { kind, lang, version: entry.version, active: entry.version === target.active, publishedAt: iso(entry.publishedAt), source: entry.source, comment: entry.comment, content: structuredClone(entry.content) });
    },
    rollback(ctx) {
      const { kind, lang } = ctx.params;
      if (!KINDS.includes(kind) || !LANGS.includes(lang)) return problem(ctx, 404, 'NOT_FOUND');
      const body = jsonBody(ctx);
      // `RollbackRequest` is read strictly (`FAIL_ON_UNKNOWN_PROPERTIES`, no coercion): an unknown field or a non-integer is a 400.
      const known = body !== null && Object.keys(body).every((key) => ['baseVersion', 'targetVersion'].includes(key));
      if (!known || !isCount(body.baseVersion) || !Number.isInteger(body.targetVersion) || body.targetVersion < 1) return problem(ctx, 400, 'BAD_REQUEST');
      if (body.baseVersion > INT_MAX || body.targetVersion > INT_MAX) return problem(ctx, 400, 'BAD_REQUEST');
      const target = slot(kind, lang);
      // Same order as `RollbackContentService`: the base first (409), then the target (404), then today's rules (422).
      if (body.baseVersion !== target.active) return problem(ctx, 409, 'CONTENT_VERSION_CONFLICT');
      const entry = target.versions.find((candidate) => candidate.version === body.targetVersion);
      if (!entry) return problem(ctx, 404, 'CONTENT_VERSION_NOT_FOUND');
      const violations = validateDocument(kind, lang, entry.content);
      if (violations.length > 0) return problem(ctx, 422, 'CONTENT_INVALID', violations);
      target.active = entry.version;
      return send(ctx, 200, contentBody(kind));
    },
    'images.upload': (ctx) => {
      const boundary = /boundary=("?)([^";]+)\1/.exec(ctx.req.headers['content-type'] ?? '')?.[2];
      const parts = boundary ? multipartParts(ctx.body, boundary) : [];
      const files = parts.filter((part) => part.name === 'file');
      if (parts.length !== 1 || files.length !== 1) return problem(ctx, 400, 'IMAGE_INVALID');
      const data = files[0].data;
      if (data.length > MAX_IMAGE_BYTES) return problem(ctx, 413, 'IMAGE_TOO_LARGE');
      const format = sniff(data);
      if (format === null) return problem(ctx, 400, 'IMAGE_INVALID');
      if ('unsupported' in format) return problem(ctx, 415, 'IMAGE_UNSUPPORTED_TYPE');
      const size = dimensions(data, format.ext);
      if (size === null) return problem(ctx, 400, 'IMAGE_INVALID');
      if (!state.storage) return problem(ctx, 503, 'IMAGE_STORAGE_UNAVAILABLE');
      const id = randomUUID();
      const key = `site/projects/${id}.${format.ext}`;
      // `sha256` and `fileName` are for the tests only (what arrived, byte for byte, and the part's file name); never returned.
      const sha256 = createHash('sha256').update(data).digest('hex');
      state.images.set(id, { id, key, contentType: format.type, bytes: data.length, ...size, lastModified: clock(), sha256, fileName: files[0].filename });
      return send(ctx, 201, { key, url: `${mediaBase}/${key}`, contentType: format.type, bytes: data.length, ...size });
    },
    'images.list': (ctx) => {
      if (!state.storage) return problem(ctx, 503, 'IMAGE_STORAGE_UNAVAILABLE');
      const images = [...state.images.values()]
        .sort((a, b) => b.lastModified - a.lastModified)
        .map((image) => ({ key: image.key, url: `${mediaBase}/${image.key}`, bytes: image.bytes, lastModified: iso(image.lastModified), referenced: referenced(image.key) }));
      return send(ctx, 200, { images });
    },
    'images.delete': (ctx) => {
      // Like `DeleteImageService`: an id that is not a lowercase UUID is simply not found (before asking the storage).
      if (!UUID.test(ctx.params.id)) return problem(ctx, 404, 'IMAGE_NOT_FOUND');
      if (!state.storage) return problem(ctx, 503, 'IMAGE_STORAGE_UNAVAILABLE');
      const image = state.images.get(ctx.params.id);
      if (!image) return problem(ctx, 404, 'IMAGE_NOT_FOUND');
      if (referenced(image.key)) return problem(ctx, 409, 'IMAGE_IN_USE');
      state.images.delete(image.id);
      return send(ctx, 204, undefined);
    },
    'images.cleanup': (ctx) => {
      const dryRunRaw = ctx.query.get('dryRun') ?? 'true';
      const hoursRaw = ctx.query.get('olderThanHours') ?? '24';
      // `@QueryParam int olderThanHours`: a value JAX-RS cannot convert (not an integer, out of the int range) is a 404 by the JAX-RS rule
      // for query parameters, which the API's `transport` mapper turns into `NOT_FOUND`. Inferred from the spec, not run against the API.
      if (!/^[+-]?\d+$/.test(hoursRaw) || Math.abs(Number(hoursRaw)) > 2_147_483_647) return problem(ctx, 404, 'NOT_FOUND');
      // Stricter than the API on purpose: Java's `boolean` turns anything but `true` into `false` (a real deletion); the web only sends booleans.
      if (!['true', 'false'].includes(dryRunRaw)) return problem(ctx, 400, 'BAD_REQUEST');
      // `CleanupOrphanImagesService`: a grace below 1 hour is raised to 1 (a fresh upload is not saved in any project yet).
      const hours = Math.max(1, Number(hoursRaw));
      if (!state.storage) return problem(ctx, 503, 'IMAGE_STORAGE_UNAVAILABLE');
      const dryRun = dryRunRaw === 'true';
      const orphans = [...state.images.values()].filter((image) => !referenced(image.key) && clock() - image.lastModified >= hours * HOUR_MS);
      if (!dryRun) for (const image of orphans) state.images.delete(image.id);
      const keys = orphans.map((image) => image.key);
      return send(ctx, 200, { dryRun, deleted: dryRun ? [] : keys, wouldDelete: dryRun ? keys : [], kept: state.images.size - (dryRun ? orphans.length : 0) });
    },
    'messages.list': (ctx) => {
      // The resource takes both as strings and parses them itself (`Integer.parseInt`, `Long.parseLong`): anything else is a 400, never a corrected value.
      const limit = javaInteger(ctx.query.get('limit'), 1n, 100n, 50n);
      const before = javaInteger(ctx.query.get('before'), 1n, LONG_MAX, null);
      if (limit === undefined || before === undefined) return problem(ctx, 400, 'BAD_REQUEST');
      // Newest first, the higher id first on the same instant (`ORDER BY created_at DESC, id DESC`).
      const newer = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id;
      const cursor = before === null ? null : state.messages.find((message) => BigInt(message.id) === before);
      // Like the real API, a cursor that does not exist gives an empty list.
      const ordered = cursor === undefined ? [] : [...state.messages].sort(newer).filter((message) => cursor === null || newer(cursor, message) < 0);
      const page = ordered.slice(0, Number(limit));
      // `ipHash` is stored on purpose: the real API keeps a hash of the sender and never returns it.
      const messages = page.map(({ id, name, email, body, createdAt }) => ({ id, name, email, body, createdAt }));
      const next = ordered.length > page.length ? String(page[page.length - 1].id) : null;
      return send(ctx, 200, { messages, next });
    },
  };

  const ROUTES = [
    ['POST', /^\/auth\/login$/, 'login', false],
    ['GET', /^\/auth\/session$/, 'session', true],
    ['PUT', /^\/auth\/password$/, 'password', true],
    ['POST', /^\/auth\/logout-all$/, 'logout-all', true],
    ['GET', /^\/content\/(?<kind>[^/]+)$/, 'content.get', true],
    ['PUT', /^\/content\/(?<kind>[^/]+)$/, 'content.save', true],
    ['GET', /^\/content\/(?<kind>[^/]+)\/(?<lang>[^/]+)\/versions$/, 'versions.list', true],
    ['GET', /^\/content\/(?<kind>[^/]+)\/(?<lang>[^/]+)\/versions\/(?<version>[^/]+)$/, 'versions.get', true],
    ['POST', /^\/content\/(?<kind>[^/]+)\/(?<lang>[^/]+)\/rollback$/, 'rollback', true],
    ['POST', /^\/images$/, 'images.upload', true],
    ['GET', /^\/images$/, 'images.list', true],
    ['POST', /^\/images\/cleanup$/, 'images.cleanup', true],
    ['DELETE', /^\/images\/(?<id>[^/]+)$/, 'images.delete', true],
    ['GET', /^\/contact-messages$/, 'messages.list', true],
  ];

  const publicKind = (pathname) => /^\/api\/v1\/(services|projects|architecture)\/?$/.exec(pathname)?.[1];

  /**
   * Answers one request when it is an admin route or a public read of content the store holds. Resolves `false` (and writes nothing) otherwise,
   * so the caller can fall back to its own routes.
   */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://fake');
    const kind = publicKind(url.pathname);
    if (kind !== undefined && req.method === 'GET') {
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
      const entry = activeOf(kind, lang);
      if (entry === null) return false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(toPublic(kind, entry.content, mediaBase)));
      return true;
    }
    if (!url.pathname.startsWith('/api/v1/admin/') && url.pathname !== '/api/v1/admin') return false;

    const requestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : '';
    const ctx = { req, res, query: url.searchParams, params: {}, body: Buffer.alloc(0), requestId };
    state.received.push({ method: req.method ?? '', path: url.pathname, headers: { ...req.headers } });
    ctx.body = await readBody(req);

    // The real API answers 404 to anything that went through Cloudflare when `CV_ADMIN_EDGE_BLOCK=true`.
    if (req.headers['cf-ray'] !== undefined || req.headers['cf-connecting-ip'] !== undefined) {
      problem(ctx, 404, 'NOT_FOUND');
      return true;
    }
    const subPath = url.pathname.slice('/api/v1/admin'.length);
    const matched = ROUTES.map(([method, pattern, operation, needsAuth]) => ({ method, match: pattern.exec(subPath), operation, needsAuth })).find(
      (route) => route.method === req.method && route.match !== null,
    );
    if (!matched) {
      if (authorized(ctx) === null) problem(ctx, 401, 'ADMIN_UNAUTHORIZED');
      else problem(ctx, 404, 'NOT_FOUND');
      return true;
    }
    ctx.params = { ...matched.match.groups };

    const fault = state.faults.get(matched.operation);
    if (fault) {
      if (fault.remaining !== undefined) {
        fault.remaining -= 1;
        if (fault.remaining <= 0) state.faults.delete(matched.operation);
      }
      if (fault.latencyMs) await wait(fault.latencyMs);
      if (fault.mode === 'silence') return true; // never answers: the caller's timeout fires
      if (fault.mode === '500') {
        problem(ctx, 500, 'UNEXPECTED');
        return true;
      }
      if (fault.mode === 'invalid-json') {
        send(ctx, 200, '{"truncated":', { type: 'application/json' });
        return true;
      }
    }

    const entry = authorized(ctx);
    if (matched.needsAuth && entry === null) {
      problem(ctx, 401, 'ADMIN_UNAUTHORIZED');
      return true;
    }
    operations[matched.operation](ctx, entry);
    return true;
  }

  return {
    handle,
    state,
    /** Lifts the login lock (what `admin-password.sh unlock` does). */
    unlock() {
      state.failures = 0;
      state.lockedUntil = 0;
    },
    /** Makes an operation misbehave: `{mode: '500' | 'silence' | 'invalid-json', latencyMs?, remaining?}`. Operation names are the keys of `ROUTES`. */
    inject(operation, fault) {
      state.faults.set(operation, { ...fault });
    },
    clearFaults() {
      state.faults.clear();
    },
    /** `false` makes every image operation answer 503 `IMAGE_STORAGE_UNAVAILABLE`. */
    setStorage(available) {
      state.storage = available;
    },
  };
}
