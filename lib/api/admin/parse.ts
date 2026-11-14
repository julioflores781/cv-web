import {
  CONTENT_KINDS,
  CONTENT_LANGS,
  type AdminContent,
  type CleanupReport,
  type ContactMessage,
  type ContentKind,
  type ContentLang,
  type LanguageContent,
  type LoginSession,
  type MessagePage,
  type Parity,
  type SessionInfo,
  type StoredImage,
  type UploadedImage,
  type VersionList,
  type VersionSnapshot,
  type VersionSummary,
  type ViolationEntry,
} from './types';

type Obj = Record<string, unknown>;

/** Most violations kept from one answer (the API caps its own lists; this bounds what a broken one could send). */
export const MAX_VIOLATIONS = 200;
const MAX_PATH_LENGTH = 200;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,59}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const SECONDS = /^\d{1,9}$/;

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
const isCount = (value: unknown): value is number => isInt(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === 'string';

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

/** Absent and `null` are the same: no value. `false` when it is present but not a string. */
function optText(value: unknown): string | null | false {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : false;
}

function optInstant(value: unknown): string | null | false {
  if (value === undefined || value === null) return null;
  return isInstant(value) ? value : false;
}

/** `path` and `code` pairs of a problem; anything that is not a bounded `{path, code}` of strings is dropped. */
export function parseViolations(raw: unknown): ViolationEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ViolationEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_VIOLATIONS) break;
    if (!isObj(item)) continue;
    const { path, code } = item;
    if (typeof path === 'string' && path.length <= MAX_PATH_LENGTH && typeof code === 'string' && CODE_PATTERN.test(code)) out.push({ path, code });
  }
  return out;
}

/** `Retry-After` in whole seconds; `undefined` for anything else (a date, text, a negative or absurd number). */
export function parseRetryAfter(header: string | string[] | undefined): number | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value !== undefined && SECONDS.test(value.trim()) ? Number(value.trim()) : undefined;
}

export interface ProblemBody {
  code: string;
  title: string;
  errors?: ViolationEntry[];
}

/** The parts of a `problem+json` body the panel uses; `null` when the body is not one (no usable `code`). */
export function parseProblemBody(raw: unknown): ProblemBody | null {
  if (!isObj(raw) || typeof raw.code !== 'string' || !CODE_PATTERN.test(raw.code)) return null;
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 200) : '';
  return Array.isArray(raw.errors) ? { code: raw.code, title, errors: parseViolations(raw.errors) } : { code: raw.code, title };
}

export function parseLoginSession(raw: unknown): LoginSession | null {
  if (!isObj(raw)) return null;
  const { accessToken, tokenType, expiresAt } = raw;
  if (typeof accessToken !== 'string' || accessToken === '' || tokenType !== 'Bearer' || !isInstant(expiresAt)) return null;
  return { accessToken, tokenType, expiresAt };
}

export function parseSessionInfo(raw: unknown): SessionInfo | null {
  if (!isObj(raw) || raw.authenticated !== true || !isInstant(raw.expiresAt)) return null;
  const passwordChangedAt = optInstant(raw.passwordChangedAt);
  return passwordChangedAt === false ? null : { authenticated: true, expiresAt: raw.expiresAt, passwordChangedAt };
}

export const isContentKind = (value: unknown): value is ContentKind => CONTENT_KINDS.some((kind) => kind === value);
export const isContentLang = (value: unknown): value is ContentLang => CONTENT_LANGS.some((lang) => lang === value);

function parseLanguage(raw: unknown): LanguageContent | null {
  if (!isObj(raw) || !isCount(raw.version)) return null;
  const publishedAt = optInstant(raw.publishedAt);
  const source = optText(raw.source);
  const comment = optText(raw.comment);
  if (publishedAt === false || source === false || comment === false) return null;
  // Nothing published is `version: 0` with a `null` content; anything published must carry its document.
  if (raw.version === 0) return raw.content === null || raw.content === undefined ? { version: 0, publishedAt, source, comment, content: null } : null;
  return isObj(raw.content) ? { version: raw.version, publishedAt, source, comment, content: raw.content } : null;
}

function parseParity(raw: unknown): Parity | null {
  if (!isObj(raw) || typeof raw.ok !== 'boolean' || !Array.isArray(raw.differences)) return null;
  return { ok: raw.ok, differences: parseViolations(raw.differences) };
}

/** `GET`/`PUT /content/{kind}` and the answer of a rollback. */
export function parseAdminContent(raw: unknown): AdminContent | null {
  if (!isObj(raw) || !isContentKind(raw.kind) || !isObj(raw.languages)) return null;
  const es = parseLanguage(raw.languages.es);
  const en = parseLanguage(raw.languages.en);
  const parity = parseParity(raw.parity);
  return es === null || en === null || parity === null ? null : { kind: raw.kind, languages: { es, en }, parity };
}

function parseVersionSummary(raw: unknown): VersionSummary | null {
  if (!isObj(raw) || !isInt(raw.version) || raw.version < 1 || typeof raw.active !== 'boolean') return null;
  const comment = optText(raw.comment);
  if (!isInstant(raw.publishedAt) || typeof raw.source !== 'string' || comment === false) return null;
  return { version: raw.version, active: raw.active, publishedAt: raw.publishedAt, source: raw.source, comment };
}

export function parseVersionList(raw: unknown): VersionList | null {
  if (!isObj(raw) || !isContentKind(raw.kind) || !isContentLang(raw.lang) || !Array.isArray(raw.versions)) return null;
  const versions: VersionSummary[] = [];
  for (const item of raw.versions) {
    const version = parseVersionSummary(item);
    if (version === null) return null;
    versions.push(version);
  }
  return { kind: raw.kind, lang: raw.lang, versions };
}

export function parseVersionSnapshot(raw: unknown): VersionSnapshot | null {
  if (!isObj(raw) || !isContentKind(raw.kind) || !isContentLang(raw.lang)) return null;
  if (!isInt(raw.version) || raw.version < 1 || typeof raw.active !== 'boolean' || !isObj(raw.content)) return null;
  const publishedAt = optInstant(raw.publishedAt);
  const source = optText(raw.source);
  const comment = optText(raw.comment);
  if (publishedAt === false || source === false || comment === false) return null;
  return { kind: raw.kind, lang: raw.lang, version: raw.version, active: raw.active, publishedAt, source, comment, content: raw.content };
}

export function parseUploadedImage(raw: unknown): UploadedImage | null {
  if (!isObj(raw)) return null;
  const { key, url, contentType, bytes, width, height } = raw;
  if (!isText(key) || !isText(url) || !isText(contentType) || !isCount(bytes) || !isInt(width) || !isInt(height)) return null;
  return { key, url, contentType, bytes, width, height };
}

function parseStoredImage(raw: unknown): StoredImage | null {
  if (!isObj(raw)) return null;
  const { key, url, bytes, lastModified, referenced } = raw;
  if (!isText(key) || !isText(url) || !isCount(bytes) || !isInstant(lastModified) || typeof referenced !== 'boolean') return null;
  return { key, url, bytes, lastModified, referenced };
}

export function parseStoredImages(raw: unknown): StoredImage[] | null {
  if (!isObj(raw) || !Array.isArray(raw.images)) return null;
  const images: StoredImage[] = [];
  for (const item of raw.images) {
    const image = parseStoredImage(item);
    if (image === null) return null;
    images.push(image);
  }
  return images;
}

const parseKeys = (raw: unknown): string[] | null => (Array.isArray(raw) && raw.every(isText) ? raw : null);

export function parseCleanupReport(raw: unknown): CleanupReport | null {
  if (!isObj(raw) || typeof raw.dryRun !== 'boolean' || !isCount(raw.kept)) return null;
  const deleted = parseKeys(raw.deleted);
  const wouldDelete = parseKeys(raw.wouldDelete);
  return deleted === null || wouldDelete === null ? null : { dryRun: raw.dryRun, deleted, wouldDelete, kept: raw.kept };
}

function parseMessage(raw: unknown): ContactMessage | null {
  if (!isObj(raw)) return null;
  // Only the five documented fields are kept: anything else (an `ip_hash`) is dropped here.
  const { id, name, email, body, createdAt } = raw;
  if (!isInt(id) || !isText(name) || !isText(email) || !isText(body) || !isInstant(createdAt)) return null;
  return { id, name, email, body, createdAt };
}

export function parseMessagePage(raw: unknown): MessagePage | null {
  if (!isObj(raw) || !Array.isArray(raw.messages)) return null;
  const next = optText(raw.next);
  if (next === false) return null;
  const messages: ContactMessage[] = [];
  for (const item of raw.messages) {
    const message = parseMessage(item);
    if (message === null) return null;
    messages.push(message);
  }
  return { messages, next };
}

/** A success with no body (204). */
export const parseEmpty = (): true => true;
