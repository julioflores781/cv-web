import type { IncomingHttpHeaders } from 'node:http';

/** The three editable documents of the API (`/api/v1/admin/content/{kind}`). */
export const CONTENT_KINDS = ['services', 'projects', 'architecture'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type ContentLang = 'es' | 'en';
export const CONTENT_LANGS: readonly ContentLang[] = ['es', 'en'];

/** One violation reported by the API: where (`es.projects[1].client`) and why (`ANONYMOUS_CLIENT_FORBIDDEN`). */
export interface ViolationEntry {
  path: string;
  code: string;
}

/** An RFC 7807 answer of the admin API. `errors` only exists on 422; `retryAfterSeconds` only on 429. */
export interface AdminProblem {
  kind: 'problem';
  status: number;
  /** Stable code (`ADMIN_UNAUTHORIZED`); `HTTP_<status>` when the API sent no problem body. The UI maps messages from it, never from `title`. */
  code: string;
  title: string;
  errors?: ViolationEntry[];
  retryAfterSeconds?: number;
  requestId: string;
}

/**
 * What a call to the admin API gave back. Calls never throw and no failure carries a URL, host, body or cause.
 * `invalid` is either an answer that does not match the contract (`source: 'response'`) or a request refused before it was sent (`source: 'input'`).
 */
export type AdminResult<T> =
  | { kind: 'ok'; status: number; data: T; headers: IncomingHttpHeaders; requestId: string }
  | AdminProblem
  | { kind: 'unreachable'; requestId: string }
  | { kind: 'timeout'; requestId: string }
  | { kind: 'invalid'; source: 'response' | 'input'; requestId: string };

/** What every operation needs from the incoming request; none of it is copied from the browser's headers. */
export interface AdminCallContext {
  /** JWT of the session cookie. Absent only for the login. */
  token?: string | undefined;
  /** Reused as `X-Request-Id` when given (32 hex); one is generated otherwise. */
  requestId?: string | undefined;
  /** Raw `CF-Connecting-IP` of the incoming request; forwarded as `X-Client-IP` only when it is a valid address. */
  clientIp?: string | null | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  /** Pause between the two attempts of a read. */
  retryDelayMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface LoginSession {
  accessToken: string;
  tokenType: 'Bearer';
  /** ISO instant at which the token stops being valid. */
  expiresAt: string;
}

export interface SessionInfo {
  authenticated: true;
  expiresAt: string;
  passwordChangedAt: string | null;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

/** A stored document: the shape of `db/sample/*.json`, not the public DTO. Its fields are validated by the API (and mirrored by the editor). */
export type ContentDocument = Record<string, unknown>;

export interface LanguageContent {
  /** Active version; 0 when nothing is published (then `content` is `null`; not an error). */
  version: number;
  publishedAt: string | null;
  source: string | null;
  comment: string | null;
  content: ContentDocument | null;
}

export interface Parity {
  ok: boolean;
  /** Paths without a language prefix (`projects[1].relation`). */
  differences: ViolationEntry[];
}

export interface AdminContent {
  kind: ContentKind;
  languages: Record<ContentLang, LanguageContent>;
  parity: Parity;
}

export interface SaveContentInput {
  baseVersions: Record<ContentLang, number>;
  comment?: string | undefined;
  documents: Record<ContentLang, ContentDocument>;
}

export interface VersionSummary {
  version: number;
  active: boolean;
  publishedAt: string;
  source: string;
  comment: string | null;
}

export interface VersionList {
  kind: ContentKind;
  lang: ContentLang;
  versions: VersionSummary[];
}

export interface VersionSnapshot {
  kind: ContentKind;
  lang: ContentLang;
  version: number;
  active: boolean;
  /** Optional in the API's schema (`VersionSnapshot`); `null` when absent. */
  publishedAt: string | null;
  source: string | null;
  comment: string | null;
  content: ContentDocument;
}

export interface RollbackInput {
  /** The active version the panel is looking at; the API answers 409 when it is not the active one any more. */
  baseVersion: number;
  targetVersion: number;
}

export interface UploadedImage {
  key: string;
  url: string;
  contentType: string;
  bytes: number;
  width: number;
  height: number;
}

export interface StoredImage {
  key: string;
  url: string;
  bytes: number;
  lastModified: string;
  /** `true` when any version of any project refers to it (then it cannot be deleted). */
  referenced: boolean;
}

export interface CleanupInput {
  dryRun: boolean;
  olderThanHours: number;
}

export interface CleanupReport {
  dryRun: boolean;
  deleted: string[];
  wouldDelete: string[];
  kept: number;
}

export interface ContactMessage {
  id: number;
  name: string;
  email: string;
  body: string;
  createdAt: string;
}

export interface MessagePage {
  messages: ContactMessage[];
  /** Pass it as `before` to get the next page; `null` when there are no more. */
  next: string | null;
}

export interface MessageQuery {
  limit?: number;
  before?: number;
}
