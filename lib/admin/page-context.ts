import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { readToken } from '@/lib/admin/session';
import { expiredLoginUrl } from '@/lib/admin/next-path';
import type { AdminCallContext, AdminResult } from '@/lib/api/admin';
import { newRequestId } from '@/lib/request-id';

/**
 * What a panel page needs to call the admin API on the server: the session token, a request id and the visitor IP (as `X-Client-IP`).
 * Server only (it reads the cookie).
 */
export async function pageContext(): Promise<AdminCallContext & { requestId: string }> {
  return { token: readToken(await cookies()), requestId: newRequestId(), clientIp: (await headers()).get('cf-connecting-ip') };
}

/** A 401 of the API on a page means the session died: back to the login, remembering the page. */
export function expireOn401<T>(result: AdminResult<T>, path: string): void {
  if (result.kind === 'problem' && result.status === 401) redirect(expiredLoginUrl(path));
}

/** Code of the message for a page read that did not succeed (the text comes from `lib/admin/messages.ts`). */
export function failureCode<T>(result: Exclude<AdminResult<T>, { kind: 'ok' }>): string {
  if (result.kind === 'timeout') return 'ADMIN_TIMEOUT';
  if (result.kind === 'invalid') return 'ADMIN_BAD_RESPONSE';
  return 'ADMIN_UPSTREAM';
}
