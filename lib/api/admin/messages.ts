import { adminRequest } from './client';
import { ADMIN_BASE, rejectedInput } from './ops';
import { parseMessagePage } from './parse';
import type { AdminCallContext, AdminResult, MessagePage, MessageQuery } from './types';

export const MAX_MESSAGES_LIMIT = 100;

/** `GET /contact-messages?limit=&before=`: read-only, newest first. `limit` is 1 to 100; `before` is the `next` of the previous page. */
export function listMessages(query: MessageQuery, ctx: AdminCallContext): Promise<AdminResult<MessagePage>> {
  const { limit, before } = query;
  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= MAX_MESSAGES_LIMIT)) return Promise.resolve(rejectedInput(ctx));
  if (before !== undefined && !(Number.isInteger(before) && before >= 1)) return Promise.resolve(rejectedInput(ctx));
  return adminRequest({
    ...ctx,
    operation: 'messages.list',
    method: 'GET',
    path: `${ADMIN_BASE}/contact-messages`,
    query: { ...(limit === undefined ? {} : { limit }), ...(before === undefined ? {} : { before }) },
    parse: parseMessagePage,
  });
}
