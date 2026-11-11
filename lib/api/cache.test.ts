// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resumeEs } from '@/tests/fixtures/resume';
import { cacheFile, readCache, writeCache, writeJson } from './cache';
import { resolveCacheDir } from './config';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cv-web-cache-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('cache', () => {
  it('extra: concurrent writes of the same file all succeed and leave no temp file behind', async () => {
    await Promise.all(Array.from({ length: 50 }, (_, index) => writeJson(dir, 'architecture', 'es', { index })));
    expect((await readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect((await readdir(dir)).filter((name) => name.endsWith('.json'))).toEqual(['architecture-es.json']);
  });

  it('T20: an interrupted write (temp file only) is not taken as the fallback', async () => {
    await writeFile(`${cacheFile(dir, 'es')}.123.tmp`, JSON.stringify(resumeEs));
    expect(await readCache(dir, 'es')).toBeNull();
  });

  it('T22: without CV_CACHE_DIR the directory is .next/cache/cv-web', () => {
    expect(resolveCacheDir({}, '/work/app')).toBe(path.join('/work/app', '.next', 'cache', 'cv-web'));
    expect(resolveCacheDir({ CV_CACHE_DIR: '/tmp/x' }, '/work/app')).toBe(path.resolve('/tmp/x'));
  });

  it('extra: write then read round-trips and leaves no temp files', async () => {
    const nested = path.join(dir, 'a', 'b');
    await writeCache(nested, 'es', resumeEs);
    expect(await readCache(nested, 'es')).toEqual(resumeEs);
    expect((await readdir(nested)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('extra: a copy saved under the wrong language is ignored', async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(cacheFile(dir, 'en'), JSON.stringify(resumeEs));
    expect(await readCache(dir, 'en')).toBeNull();
  });
});
