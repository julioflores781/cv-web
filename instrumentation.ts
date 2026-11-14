import type { Instrumentation } from 'next';
import { logEvent } from '@/lib/log';

const pathOf = (path: string): string => path.split(/[?#]/, 1)[0] ?? '';

/**
 * Next calls this for every error it captures on the server (render, route handler, action). Only the route, the method, the path without
 * query, the digest and the class of the error are logged: never headers, query string nor the error message.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? error.digest : undefined;
  logEvent('error', 'render_error', {
    route_path: context.routePath,
    route_type: context.routeType,
    method: request.method,
    path: pathOf(request.path),
    digest,
    error: error instanceof Error ? error : undefined,
  });
};
