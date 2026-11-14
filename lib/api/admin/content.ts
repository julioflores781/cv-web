import { adminRequest } from './client';
import { ADMIN_BASE, rejectedInput } from './ops';
import { isContentKind, isContentLang, parseAdminContent, parseVersionList, parseVersionSnapshot } from './parse';
import type {
  AdminCallContext,
  AdminContent,
  AdminResult,
  ContentKind,
  ContentLang,
  RollbackInput,
  SaveContentInput,
  VersionList,
  VersionSnapshot,
} from './types';

export const MAX_VERSIONS_LIMIT = 200;

const contentPath = (kind: ContentKind) => `${ADMIN_BASE}/content/${kind}`;
const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;
const isPositive = (value: number): boolean => Number.isInteger(value) && value >= 1;

/** `GET /content/{kind}`: both languages and their parity. A language with nothing published is `version: 0, content: null`, not an error. */
export function getAdminContent(kind: string, ctx: AdminCallContext): Promise<AdminResult<AdminContent>> {
  if (!isContentKind(kind)) return Promise.resolve(rejectedInput(ctx));
  return adminRequest({ ...ctx, operation: 'content.get', method: 'GET', path: contentPath(kind), parse: parseAdminContent });
}

/**
 * `PUT /content/{kind}`: the whole bilingual document in one atomic save. The body is exactly `{baseVersions, comment?, documents}`
 * (an empty comment is left out). 409 `CONTENT_VERSION_CONFLICT`, 422 `CONTENT_INVALID` (with `errors`) or `CONTENT_PARITY_BROKEN`, 413 come back as problems.
 */
export function saveAdminContent(kind: string, input: SaveContentInput, ctx: AdminCallContext): Promise<AdminResult<AdminContent>> {
  const { baseVersions, documents } = input;
  if (!isContentKind(kind) || !isCount(baseVersions.es) || !isCount(baseVersions.en)) return Promise.resolve(rejectedInput(ctx));
  const comment = input.comment?.trim();
  const json = {
    baseVersions: { es: baseVersions.es, en: baseVersions.en },
    ...(comment ? { comment } : {}),
    documents: { es: documents.es, en: documents.en },
  };
  return adminRequest({ ...ctx, operation: 'content.save', method: 'PUT', path: contentPath(kind), json, parse: parseAdminContent });
}

/** `GET /content/{kind}/{lang}/versions?limit=`: newest first. */
export function listVersions(kind: string, lang: string, ctx: AdminCallContext, limit?: number): Promise<AdminResult<VersionList>> {
  if (!isContentKind(kind) || !isContentLang(lang) || (limit !== undefined && !(isPositive(limit) && limit <= MAX_VERSIONS_LIMIT))) {
    return Promise.resolve(rejectedInput(ctx));
  }
  return adminRequest({
    ...ctx,
    operation: 'content.versions',
    method: 'GET',
    path: `${contentPath(kind)}/${lang}/versions`,
    ...(limit === undefined ? {} : { query: { limit } }),
    parse: parseVersionList,
  });
}

/** `GET /content/{kind}/{lang}/versions/{n}`: one snapshot. 404 `CONTENT_VERSION_NOT_FOUND`. */
export function getVersion(kind: string, lang: string, version: number, ctx: AdminCallContext): Promise<AdminResult<VersionSnapshot>> {
  if (!isContentKind(kind) || !isContentLang(lang) || !isPositive(version)) return Promise.resolve(rejectedInput(ctx));
  return adminRequest({ ...ctx, operation: 'content.version', method: 'GET', path: `${contentPath(kind)}/${lang}/versions/${version}`, parse: parseVersionSnapshot });
}

/** `POST /content/{kind}/{lang}/rollback`: reactivates an existing version. 409 when `baseVersion` is no longer the active one. */
export function rollbackContent(kind: string, lang: ContentLang | string, input: RollbackInput, ctx: AdminCallContext): Promise<AdminResult<AdminContent>> {
  if (!isContentKind(kind) || !isContentLang(lang) || !isCount(input.baseVersion) || !isPositive(input.targetVersion)) {
    return Promise.resolve(rejectedInput(ctx));
  }
  const json = { baseVersion: input.baseVersion, targetVersion: input.targetVersion };
  return adminRequest({ ...ctx, operation: 'content.rollback', method: 'POST', path: `${contentPath(kind)}/${lang}/rollback`, json, parse: parseAdminContent });
}
