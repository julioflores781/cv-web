// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { cacheFile, writeCache } from './cache';
import { ResumeUnavailableError } from './errors';
import { getResume, resetResumeMemo } from './get-resume';

let dir: string;
let server: TestServer | undefined;

beforeEach(async () => {
  resetResumeMemo();
  dir = await mkdtemp(path.join(os.tmpdir(), 'cv-web-get-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
  await rm(dir, { recursive: true, force: true });
});

async function options(extra: { baseUrl?: string } = {}) {
  return { baseUrl: extra.baseUrl ?? (await closedPortUrl()), cacheDir: dir, retries: 0, retryDelayMs: 1 };
}

describe('getResume', () => {
  it('T14: with the API up it returns source api and saves resume-es.json', async () => {
    server = await startServer((_req, res) => json(res, 200, resumeEs));
    const result = await getResume('es', await options({ baseUrl: server.url }));
    expect(result.source).toBe('api');
    expect(JSON.parse(await readFile(cacheFile(dir, 'es'), 'utf8'))).toEqual(resumeEs);
  });

  it('T15: with the API down and a valid fallback it returns source cache and warns with language and cause', async () => {
    await writeCache(dir, 'es', resumeEs);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await getResume('es', await options());
    expect(result).toEqual({ resume: resumeEs, source: 'cache' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/"es".*request failed/);
  });

  it('T16: with the API down and no fallback it throws ResumeUnavailableError naming language and cause', async () => {
    const error = await getResume('es', await options()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResumeUnavailableError);
    expect((error as Error).message).toMatch(/\(es\)/);
    expect((error as Error).message).toMatch(/request failed/);
  });

  it('T17: a corrupt fallback is treated as missing', async () => {
    await writeFile(cacheFile(dir, 'es'), '{ not json');
    await expect(getResume('es', await options())).rejects.toBeInstanceOf(ResumeUnavailableError);
  });

  it('T18: invalid API data never overwrites the previous fallback, which is used instead', async () => {
    await writeCache(dir, 'es', resumeEs);
    const before = await readFile(cacheFile(dir, 'es'), 'utf8');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    server = await startServer((_req, res) => json(res, 200, { language: 'es', profile: 'broken' }));
    const result = await getResume('es', await options({ baseUrl: server.url }));
    expect(result.source).toBe('cache');
    expect(await readFile(cacheFile(dir, 'es'), 'utf8')).toBe(before);
  });

  it('T19: a fallback saved only for es does not serve en', async () => {
    await writeCache(dir, 'es', resumeEs);
    await expect(getResume('en', await options())).rejects.toBeInstanceOf(ResumeUnavailableError);
  });

  it('T21: two consecutive calls make a single HTTP request', async () => {
    server = await startServer((_req, res) => json(res, 200, resumeEn));
    const opts = await options({ baseUrl: server.url });
    const [first, second] = await Promise.all([getResume('en', opts), getResume('en', opts)]);
    expect(first).toBe(second);
    await getResume('en', opts);
    expect(server.requests).toHaveLength(1);
  });
});
