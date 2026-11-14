// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
import { onRequestError } from './instrumentation';

afterEach(() => vi.restoreAllMocks());

type Args = Parameters<typeof onRequestError>;

describe('onRequestError', () => {
  it('W16: logs one render_error with route, method, path without query, digest and error class, and no headers nor message', async () => {
    class ApiFetchError extends Error {
      override name = 'ApiFetchError';
    }
    const error = Object.assign(new ApiFetchError('Resume (es): https://api.internal/x?token=CANARY-MESSAGE'), { digest: '1234567' });
    const request = { path: '/servicios/?utm=CANARY-QUERY', method: 'GET', headers: { cookie: 'CANARY-COOKIE', authorization: 'CANARY-AUTH' } };
    const context = { routerKind: 'App Router', routePath: '/[[...slug]]', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined, renderType: 'dynamic' };
    const logs = captureLogs();
    await onRequestError(error, request, context as Args[2]);
    const [line] = logs.lines();
    expect(logs.lines()).toHaveLength(1);
    expect(line?.stream).toBe('stderr');
    expect(line?.entry).toMatchObject({
      level: 'error',
      service: 'cv-web',
      event: 'render_error',
      route_path: '/[[...slug]]',
      route_type: 'render',
      method: 'GET',
      path: '/servicios/',
      digest: '1234567',
      error: 'ApiFetchError',
    });
    expect(line?.raw).not.toMatch(/CANARY|api\.internal|utm/);
  });

  it('extra: a thrown value that is not an Error (a string with data) is not logged', async () => {
    const logs = captureLogs();
    await onRequestError('CANARY-STRING', { path: '/', method: 'GET', headers: {} }, { routerKind: 'App Router', routePath: '/x', routeType: 'route' } as Args[2]);
    expect(logs.text()).not.toContain('CANARY');
    expect(logs.events('render_error')).toHaveLength(1);
  });
});
