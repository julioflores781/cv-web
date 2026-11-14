import type { Metadata } from 'next';
import { LoadFailure } from '@/components/admin/load-failure';
import { MessagesList } from '@/components/admin/messages-list';
import styles from '@/components/admin/editor.module.css';
import { MESSAGES_LIMIT, messagesUrl, parseCursor } from '@/lib/admin/contact-messages';
import { adminMessage, UI } from '@/lib/admin/messages';
import { expireOn401, failureCode, pageContext } from '@/lib/admin/page-context';
import { listMessages } from '@/lib/api/admin';
import { logEvent } from '@/lib/log';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: UI.messages.title };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Contact messages, read only, newest first: one page of 50 per visit, read from the API every time (nothing is cached or kept in the
 * browser). `?before=<id>` is the cursor of the API; one that is not a positive integer is ignored. The messages are personal data: the
 * log line carries only the outcome and how many were shown.
 */
export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  const before = parseCursor((await searchParams).before);
  const path = messagesUrl(before);

  const ctx = await pageContext();
  const result = await listMessages({ limit: MESSAGES_LIMIT, ...(before === null ? {} : { before }) }, ctx);
  const expired = result.kind === 'problem' && result.status === 401;
  logEvent(result.kind === 'ok' ? 'info' : 'warn', 'admin_messages_view', {
    request_id: ctx.requestId,
    outcome: result.kind === 'ok' ? 'ok' : expired ? 'expired' : 'unavailable',
    count: result.kind === 'ok' ? result.data.messages.length : 0,
  });
  expireOn401(result, path);

  return (
    <div className={styles.frame}>
      <h1 className={`${styles.title} display`}>{UI.messages.title}</h1>
      <p className={styles.intro}>{UI.messages.intro}</p>
      {result.kind === 'ok' ? (
        <MessagesList messages={result.data.messages} before={before} next={result.data.next} />
      ) : (
        <LoadFailure text={adminMessage(failureCode(result))} reference={result.requestId} retryHref={path} />
      )}
    </div>
  );
}
