import { checkApi } from '@/lib/api/health';
import { logEvent } from '@/lib/log';
import { newRequestId } from '@/lib/request-id';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Liveness of the web plus readiness of the API it renders from. Carries no URLs, messages or content.
 * Silent while healthy (the container probes it every 30 s); a degraded answer leaves one warning.
 */
export async function GET(): Promise<Response> {
  const requestId = newRequestId();
  const api = await checkApi(requestId);
  if (api === 'up') return Response.json({ status: 'ok', api }, { headers: NO_STORE });
  logEvent('warn', 'health', { request_id: requestId, outcome: 'degraded', status: 503 });
  return Response.json({ status: 'degraded', api }, { status: 503, headers: NO_STORE });
}
