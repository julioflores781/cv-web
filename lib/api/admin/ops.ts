import { newRequestId } from '@/lib/request-id';
import type { AdminCallContext, AdminResult } from './types';

export const ADMIN_BASE = '/api/v1/admin';

/** A request the web refuses to send (an id or parameter that cannot be valid), answered without touching the API. */
export function rejectedInput<T>(ctx: AdminCallContext): AdminResult<T> {
  return { kind: 'invalid', source: 'input', requestId: ctx.requestId ?? newRequestId() };
}
