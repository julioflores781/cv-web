// @vitest-environment node
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_ARCHITECTURE, architectureEs, projectsEs, servicesEs } from '@/tests/fixtures/content';
import { resumeEs } from '@/tests/fixtures/resume';
import { captureLogs, type CapturedLogs } from '@/tests/helpers/capture-log';
import { closedPortUrl, json, startServer, type TestServer } from '@/tests/helpers/http-server';
import { getArchitecture } from './architecture';
import { ApiFetchError } from './errors';
import { getResume } from './get-resume';
import { getProjects } from './projects';
import { getServices } from './services';

let server: TestServer | undefined;
let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

const fast = (baseUrl: string) => ({ baseUrl, retryDelayMs: 1 });
/** The fixture a healthy API serves for a request URL. */
const fixtureFor = (url: string) =>
  url.includes('/resume') ? resumeEs : url.includes('/architecture') ? architectureEs : url.includes('/services') ? servicesEs : projectsEs;
const problem = (status: number) => ({ title: 't', detail: 'd', status, code: 'X' });

describe('content layer (no cache between calls)', () => {
  it('T10: two calls outside a render make two requests', async () => {
    server = await startServer((_req, res) => json(res, 200, servicesEs));
    await getServices('es', fast(server.url));
    await getServices('es', fast(server.url));
    expect(server.requests).toEqual(['/api/v1/services?lang=es', '/api/v1/services?lang=es']);
  });

  it('T11: the second call returns the content the API serves at that moment', async () => {
    let body: unknown = servicesEs;
    server = await startServer((_req, res) => json(res, 200, body));
    expect((await getServices('es', fast(server.url))).services).toEqual(servicesEs);
    body = [{ ...servicesEs[0], title: 'Changed title' }];
    expect((await getServices('es', fast(server.url))).services[0]?.title).toBe('Changed title');
  });

  it('T12: a 500 throws ApiFetchError after 1 retry and leaves no state behind', async () => {
    let healthy = false;
    server = await startServer((_req, res) => (healthy ? json(res, 200, projectsEs) : json(res, 500, problem(500))));
    await expect(getProjects('es', fast(server.url))).rejects.toBeInstanceOf(ApiFetchError);
    expect(server.requests).toHaveLength(2);
    // The failure is logged per attempt by requestJson (one request id), not again by the content layer.
    expect(logs.events('api_call')).toMatchObject([
      { path: '/api/v1/projects', outcome: 'http_error', status: 500, attempt: 1 },
      { path: '/api/v1/projects', outcome: 'http_error', status: 500, attempt: 2 },
    ]);
    await expect(getProjects('es', fast(server.url))).rejects.toBeInstanceOf(ApiFetchError);
    expect(server.requests).toHaveLength(4);
    healthy = true;
    expect((await getProjects('es', fast(server.url))).projects).toEqual(projectsEs);
  });

  it('T13: invalid JSON, a wrong shape and a language mismatch all throw', async () => {
    server = await startServer((_req, res) => json(res, 200, '{ not json'));
    await expect(getResume('es', fast(server.url))).rejects.toThrow(/not valid JSON/);
    await server.close();

    server = await startServer((_req, res) => json(res, 200, { language: 'es', profile: 'broken' }));
    await expect(getResume('es', fast(server.url))).rejects.toThrow(/expected resume shape/);
    await server.close();

    server = await startServer((_req, res) => json(res, 200, resumeEs));
    await expect(getResume('en', fast(server.url))).rejects.toThrow(/language mismatch/);
  });

  it('T14: a 404 or a 400 throws without retrying', async () => {
    for (const status of [404, 400]) {
      server = await startServer((_req, res) => json(res, status, problem(status), 'application/problem+json'));
      const error = await getArchitecture('es', fast(server.url)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiFetchError);
      expect(error).toMatchObject({ status });
      expect(server.requests).toHaveLength(1);
      await server.close();
    }
  });

  it('T15: a valid empty answer is returned as is, without error', async () => {
    server = await startServer((req, res) => json(res, 200, req.url?.includes('/architecture') ? EMPTY_ARCHITECTURE : []));
    expect((await getServices('es', fast(server.url))).services).toEqual([]);
    expect((await getProjects('es', fast(server.url))).projects).toEqual([]);
    expect((await getArchitecture('es', fast(server.url))).architecture).toEqual(EMPTY_ARCHITECTURE);
  });

  it('T16: reading the 4 resources creates no file', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-web-nofiles-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
    try {
      server = await startServer((req, res) => json(res, 200, fixtureFor(req.url ?? '')));
      const options = fast(server.url);
      await Promise.all([getResume('es', options), getArchitecture('es', options), getServices('es', options), getProjects('es', options)]);
      expect(server.requests).toHaveLength(4);
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('T18: the getters return only the typed data, without a source', async () => {
    server = await startServer((req, res) => json(res, 200, fixtureFor(req.url ?? '')));
    const options = fast(server.url);
    expect(await getResume('es', options)).toEqual({ resume: resumeEs });
    expect(await getArchitecture('es', options)).toEqual({ architecture: architectureEs });
    expect(await getServices('es', options)).toEqual({ services: servicesEs });
    expect(await getProjects('es', options)).toEqual({ projects: projectsEs });
  });

  it('extra: a refused connection throws ApiFetchError too', async () => {
    await expect(getServices('es', fast(await closedPortUrl()))).rejects.toBeInstanceOf(ApiFetchError);
  });
});
