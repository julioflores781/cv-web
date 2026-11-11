// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_ARCHITECTURE,
  LEAKED_CLIENT,
  architectureEn,
  architectureEs,
  projectsEs,
  servicesEs,
  withLeakedClient,
} from '@/tests/fixtures/content';
import { resumeEs } from '@/tests/fixtures/resume';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { getArchitecture } from './architecture';
import { getProjects } from './projects';
import { getServices } from './services';
import { cachePath, writeCache, writeJson } from './cache';
import { ContentUnavailableError } from './errors';
import { resetContentMemo } from './content';

let dir: string;
let server: TestServer | undefined;

beforeEach(async () => {
  resetContentMemo();
  dir = await mkdtemp(path.join(os.tmpdir(), 'cv-web-content-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
  await rm(dir, { recursive: true, force: true });
});

async function options(baseUrl?: string) {
  return { baseUrl: baseUrl ?? (await closedPortUrl()), cacheDir: dir, retries: 0, retryDelayMs: 1 };
}
const warnSpy = () => vi.spyOn(console, 'warn').mockImplementation(() => undefined);
const savedFile = (lang: 'es' | 'en') => cachePath(dir, 'architecture', lang);

describe('getArchitecture', () => {
  it('HX-T13: with the API up it returns source api and writes architecture-es.json', async () => {
    server = await startServer((_req, res) => json(res, 200, architectureEs));
    const result = await getArchitecture('es', await options(server.url));
    expect(result).toEqual({ architecture: architectureEs, source: 'api' });
    expect(JSON.parse(await readFile(savedFile('es'), 'utf8'))).toEqual(architectureEs);
    expect(server.requests).toEqual(['/api/v1/architecture?lang=es']);
  });

  it('HX-T14: with the API down and a valid fallback it returns source cache and warns once', async () => {
    await writeJson(dir, 'architecture', 'es', architectureEs);
    const warn = warnSpy();
    const result = await getArchitecture('es', await options());
    expect(result).toEqual({ architecture: architectureEs, source: 'cache' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/"es".*Architecture \(es\).*request failed/);
  });

  it('HX-T15: with the API down and no fallback it throws an error naming resource, language and file', async () => {
    const error = await getArchitecture('es', await options()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ContentUnavailableError);
    const message = (error as Error).message;
    expect(message).toMatch(/Architecture \(es\) unavailable/);
    expect(message).toContain(savedFile('es'));
    expect(message).toMatch(/Refusing to publish a site without data/);
  });

  it('HX-T16: an invalid shape or a 404 uses the fallback; without it the build fails, and a 404 is not retried', async () => {
    await writeJson(dir, 'architecture', 'es', architectureEs);
    warnSpy();
    server = await startServer((_req, res) => json(res, 200, { core: 'broken', ports: [] }));
    expect((await getArchitecture('es', await options(server.url))).source).toBe('cache');
    await server.close();

    resetContentMemo();
    server = await startServer((_req, res) => json(res, 404, { title: 't', detail: 'd', status: 404, code: 'NOT_FOUND' }));
    const retrying = { ...(await options(server.url)), retries: 2 };
    expect((await getArchitecture('es', retrying)).source).toBe('cache');
    expect(server.requests).toHaveLength(1);

    resetContentMemo();
    await expect(getArchitecture('en', retrying)).rejects.toBeInstanceOf(ContentUnavailableError);
  });

  it('HX-T17: a valid empty 200 is authoritative: empty data, an empty fallback is written and «section omitted» is warned', async () => {
    await writeJson(dir, 'architecture', 'es', architectureEs);
    const warn = warnSpy();
    server = await startServer((_req, res) => json(res, 200, EMPTY_ARCHITECTURE));
    const result = await getArchitecture('es', await options(server.url));
    expect(result).toEqual({ architecture: EMPTY_ARCHITECTURE, source: 'api' });
    expect(JSON.parse(await readFile(savedFile('es'), 'utf8'))).toEqual(EMPTY_ARCHITECTURE);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(/section omitted/);
  });

  it('HX-T18: a corrupt or invalid fallback is ignored', async () => {
    await writeFile(savedFile('es'), '{ not json');
    await expect(getArchitecture('es', await options())).rejects.toBeInstanceOf(ContentUnavailableError);
    await writeFile(savedFile('es'), JSON.stringify({ core: { name: 'C' }, ports: [{ id: 'p', name: 'P', adapters: [{ id: 'a', name: 'A', status: 'x' }] }] }));
    resetContentMemo();
    await expect(getArchitecture('es', await options())).rejects.toBeInstanceOf(ContentUnavailableError);
  });

  it('HX-T19: two calls for the same language make a single request, other languages their own', async () => {
    server = await startServer((req, res) => json(res, 200, req.url?.includes('lang=en') ? architectureEn : architectureEs));
    const opts = await options(server.url);
    await Promise.all([getArchitecture('es', opts), getArchitecture('es', opts)]);
    await getArchitecture('es', opts);
    expect(server.requests).toEqual(['/api/v1/architecture?lang=es']);
    await getArchitecture('en', opts);
    expect(server.requests).toHaveLength(2);
  });

  it('HX-T20: the fallbacks of different resources and languages have different names and the resume keeps resume-<lang>.json', async () => {
    await writeCache(dir, 'es', resumeEs);
    await writeJson(dir, 'architecture', 'es', architectureEs);
    await writeJson(dir, 'architecture', 'en', architectureEn);
    const names = [cachePath(dir, 'resume', 'es'), savedFile('es'), savedFile('en')].map((file) => path.basename(file));
    expect(names).toEqual(['resume-es.json', 'architecture-es.json', 'architecture-en.json']);
    expect(JSON.parse(await readFile(path.join(dir, 'resume-es.json'), 'utf8'))).toEqual(resumeEs);
  });
});

describe('getServices and getProjects', () => {
  const missing = { title: 't', detail: 'd', status: 404, code: 'NOT_FOUND' };

  it('CO-T9: with the API up they return source api and write services-es.json / projects-es.json', async () => {
    server = await startServer((req, res) => json(res, 200, req.url?.includes('/services') ? servicesEs : projectsEs));
    const opts = await options(server.url);
    expect(await getServices('es', opts)).toEqual({ services: servicesEs, source: 'api' });
    expect(await getProjects('es', opts)).toEqual({ projects: projectsEs, source: 'api' });
    expect(JSON.parse(await readFile(cachePath(dir, 'services', 'es'), 'utf8'))).toEqual(servicesEs);
    expect(JSON.parse(await readFile(cachePath(dir, 'projects', 'es'), 'utf8'))).toEqual(projectsEs);
    expect(path.basename(cachePath(dir, 'projects', 'es'))).toBe('projects-es.json');
  });

  it('CO-T10: API down uses the fallback with a warning; without it, an invalid shape or a 404 the build fails naming the resource; a 200 [] is authoritative; a corrupt copy is ignored', async () => {
    await writeJson(dir, 'services', 'es', servicesEs);
    const warn = warnSpy();
    expect(await getServices('es', await options())).toEqual({ services: servicesEs, source: 'cache' });
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/Services \(es\)|API unavailable for "es"/);

    resetContentMemo();
    const noCopy = await getProjects('es', await options()).catch((e: unknown) => e);
    expect(noCopy).toBeInstanceOf(ContentUnavailableError);
    expect((noCopy as Error).message).toMatch(/Projects \(es\) unavailable/);
    expect((noCopy as Error).message).toContain(cachePath(dir, 'projects', 'es'));

    resetContentMemo();
    server = await startServer((_req, res) => json(res, 200, { not: 'a list' }));
    await expect(getProjects('es', await options(server.url))).rejects.toBeInstanceOf(ContentUnavailableError);
    await server.close();

    resetContentMemo();
    server = await startServer((_req, res) => json(res, 404, missing));
    await expect(getProjects('es', { ...(await options(server.url)), retries: 2 })).rejects.toBeInstanceOf(ContentUnavailableError);
    expect(server.requests).toHaveLength(1);
    await server.close();

    resetContentMemo();
    server = await startServer((_req, res) => json(res, 200, []));
    expect(await getServices('es', await options(server.url))).toEqual({ services: [], source: 'api' });
    expect(JSON.parse(await readFile(cachePath(dir, 'services', 'es'), 'utf8'))).toEqual([]);
    expect(warn.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(/Services \(es\).*section omitted/);
    await server.close();

    await writeFile(cachePath(dir, 'projects', 'en'), '{ not json');
    resetContentMemo();
    await expect(getProjects('en', await options())).rejects.toBeInstanceOf(ContentUnavailableError);
  });

  it('CO-T11: the saved copy of projects never contains the client of an anonymous one', async () => {
    server = await startServer((_req, res) => json(res, 200, withLeakedClient(projectsEs)));
    const result = await getProjects('es', await options(server.url));
    expect(JSON.stringify(result.projects)).not.toContain(LEAKED_CLIENT);
    expect(await readFile(cachePath(dir, 'projects', 'es'), 'utf8')).not.toContain(LEAKED_CLIENT);
  });

  it('CO-T12: two calls to getProjects("es") make a single request', async () => {
    server = await startServer((_req, res) => json(res, 200, projectsEs));
    const opts = await options(server.url);
    await Promise.all([getProjects('es', opts), getProjects('es', opts)]);
    await getProjects('es', opts);
    expect(server.requests).toEqual(['/api/v1/projects?lang=es']);
  });
});
