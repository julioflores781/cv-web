import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/admin-shell';
import { Unavailable } from '@/components/admin/unavailable';
import { ADMIN_NAV } from '@/lib/admin/nav';
import { expiredLoginUrl, PANEL_PATH_HEADER, safeNext } from '@/lib/admin/next-path';
import { readToken } from '@/lib/admin/session';
import { adminSession } from '@/lib/api/admin';
import { logEvent } from '@/lib/log';
import { newRequestId } from '@/lib/request-id';

export const dynamic = 'force-dynamic';

/**
 * Every panel page passes here, and the API is the authority: `GET /auth/session` on each entry. A dead token goes to `login?expired=1`
 * (where `proxy.ts` drops the cookie, which a Server Component cannot) with the page as `next`, which `proxy.ts` passes in a request header
 * (validated again with `safeNext`); an API that is down shows a notice; anything else is an error.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const token = readToken(await cookies());
  if (token === undefined) redirect('/admin/login/');
  const requestId = newRequestId();
  const incoming = await headers();
  const result = await adminSession({ token, requestId, clientIp: incoming.get('cf-connecting-ip') });

  if (result.kind === 'ok') return <AdminShell items={ADMIN_NAV}>{children}</AdminShell>;
  if (result.kind === 'problem' && result.status === 401) {
    logEvent('info', 'admin_session_expired', { request_id: requestId });
    redirect(expiredLoginUrl(safeNext(incoming.get(PANEL_PATH_HEADER))));
  }
  if (result.kind === 'unreachable' || result.kind === 'timeout' || (result.kind === 'problem' && result.status >= 500)) {
    return <Unavailable reference={requestId} />;
  }
  throw new Error('The session answer of the API was not understood');
}
