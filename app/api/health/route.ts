import { checkApi } from '@/lib/api/health';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Liveness of the web plus readiness of the API it renders from. Carries no URLs, messages or content. */
export async function GET(): Promise<Response> {
  const api = await checkApi();
  return api === 'up'
    ? Response.json({ status: 'ok', api }, { headers: NO_STORE })
    : Response.json({ status: 'degraded', api }, { status: 503, headers: NO_STORE });
}
