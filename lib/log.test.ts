// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '@/tests/helpers/capture-log';
import { logEvent } from './log';

afterEach(() => vi.restoreAllMocks());

describe('logEvent', () => {
  it('W1: writes one JSON line with timestamp, level, service, event, request_id and the fields; info to stdout, warn and error to stderr', () => {
    const logs = captureLogs();
    logEvent('info', 'contact', { request_id: 'abc123', outcome: 'sent', status: 201, retried: false, code: null });
    logEvent('warn', 'health', { request_id: 'abc123' });
    logEvent('error', 'render_error');
    const [info, warn, error] = logs.lines();
    expect(info?.stream).toBe('stdout');
    expect(warn?.stream).toBe('stderr');
    expect(error?.stream).toBe('stderr');
    expect(info?.raw).not.toContain('\n');
    expect(info?.entry).toEqual({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      level: 'info',
      service: 'cv-web',
      event: 'contact',
      request_id: 'abc123',
      outcome: 'sent',
      status: 201,
      retried: false,
      code: null,
    });
    expect(warn?.entry).toMatchObject({ level: 'warn', event: 'health' });
    expect(error?.entry).toMatchObject({ level: 'error', event: 'render_error', service: 'cv-web' });
  });

  it('W2: objects, arrays, functions and circular values are dropped and an Error becomes its class name', () => {
    class BoomError extends Error {
      constructor() {
        super('secret detail https://api.internal/x?token=abc');
        this.name = 'BoomError';
      }
    }
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const logs = captureLogs();
    logEvent('warn', 'x', { obj: { a: 1 }, list: [1, 2], fn: () => 1, circular, error: new BoomError(), nothing: undefined, nan: Number.NaN, big: 1n, kept: 7 });
    const [line] = logs.lines();
    expect(line?.entry).toMatchObject({ error: 'BoomError', kept: 7 });
    for (const dropped of ['obj', 'list', 'fn', 'circular', 'nothing', 'nan', 'big']) expect(line?.entry, dropped).not.toHaveProperty(dropped);
    expect(line?.raw).not.toContain('secret detail');
    expect(line?.raw).not.toContain('api.internal');
  });

  it('W3: line breaks, quotes and more than 200 characters leave a single sanitized and truncated line', () => {
    const logs = captureLogs();
    logEvent('info', 'x', { forged: 'ok\r\n{"level":"error","event":"fake"}\u2028next', long: 'a'.repeat(500) });
    const [line] = logs.lines();
    expect(logs.lines()).toHaveLength(1);
    expect(line?.raw).not.toMatch(/[\r\n\u2028]/);
    expect(line?.entry.forged).toBe("ok {'level':'error','event':'fake'} next");
    expect((line?.entry.long as string).length).toBeLessThanOrEqual(200);
    expect(line?.entry.long).toMatch(/^a+…$/);
    expect(line?.entry.level).toBe('info');
  });

  it('W4: blocked keys (password, token, authorization, cookie, email, message, name, ip, body, website) are omitted in any letter case', () => {
    const logs = captureLogs();
    const blocked = ['password', 'token', 'authorization', 'cookie', 'email', 'message', 'name', 'ip', 'body', 'website'];
    logEvent('info', 'x', { ...Object.fromEntries(blocked.map((key) => [key, `CANARY-${key}`])), Email: 'CANARY-Email', IP: 'CANARY-IP', status: 200 });
    const [line] = logs.lines();
    expect(line?.raw).not.toContain('CANARY');
    expect(line?.entry).toMatchObject({ status: 200 });
    expect(Object.keys(line?.entry ?? {}).sort()).toEqual(['event', 'level', 'service', 'status', 'timestamp']);
  });

  it('W4 extra: keys with spaces, line breaks, zero-width or control characters, separators or fullwidth letters do not get past the block list', () => {
    const logs = captureLogs();
    const tricks = [' email', 'email ', 'e\nmail', 'e\u200bmail', 'E-Mail', 'e_mail', 'na\tme', '\u0000ip', 'ｗebsite', 'pass word', 'Authorization\r\n', 'co\u2028okie'];
    logEvent('info', 'x', { ...Object.fromEntries(tricks.map((key, i) => [key, `CANARY-${i}`])), status: 200 });
    const [line] = logs.lines();
    expect(line?.raw).not.toContain('CANARY');
    expect(Object.keys(line?.entry ?? {}).sort()).toEqual(['event', 'level', 'service', 'status', 'timestamp']);
  });

  it('extra: a field cannot overwrite timestamp, level, service or event, and logging never throws', () => {
    const logs = captureLogs();
    logEvent('info', 'real', { service: 'evil', level: 'error', event: 'fake', timestamp: 'x' });
    expect(logs.lines()[0]?.entry).toMatchObject({ service: 'cv-web', level: 'info', event: 'real' });
    vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('stdout closed');
    });
    expect(() => logEvent('info', 'x', { a: 1 })).not.toThrow();
    expect(() => logEvent('info', 'x', { get boom(): string { throw new Error('getter'); } })).not.toThrow();
  });
});
