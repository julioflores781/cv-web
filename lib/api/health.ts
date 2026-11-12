import { ApiFetchError } from './errors';
import { requestJson, type Resource } from './request';

export const HEALTH_TIMEOUT_MS = 2_000;

/** Quarkus readiness endpoint: 200 when the API can serve, 503 otherwise. The body is not inspected. */
const READY: Resource<true> = {
  name: 'Health',
  path: '/q/health/ready',
  parse: () => true,
};

export type ApiStatus = 'up' | 'down';

/** Is the CV API ready right now? One attempt, 2 s at most; any failure is `down` (the reason is never exposed). */
export async function checkApi(): Promise<ApiStatus> {
  try {
    await requestJson(READY, 'es', { timeoutMs: HEALTH_TIMEOUT_MS, retries: 0 });
    return 'up';
  } catch (error) {
    if (error instanceof ApiFetchError) return 'down';
    throw error;
  }
}
