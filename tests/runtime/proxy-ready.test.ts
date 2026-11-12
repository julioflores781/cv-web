// @vitest-environment node
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanEnv } from '@/tests/helpers/env';
import { startFakeApi } from '@/tests/helpers/fake-api';
import { startStandalone } from '@/tests/helpers/standalone';

const root = path.resolve(__dirname, '..', '..');
const PAGES = ['/', '/servicios/', '/en/', '/en/services/'];

// Phase 3 (admin) only adds these two files; they live in a temporary copy of the project, never in the repo.
const PROXY = `import { NextResponse } from 'next/server';

export function proxy(): NextResponse {
  const response = NextResponse.next();
  response.headers.set('x-probe-proxy', 'ran');
  return response;
}

export const config = { matcher: ['/admin/:path*'] };
`;

const PROBE_ROUTE = `import { cookies } from 'next/headers';

export async function POST(): Promise<Response> {
  (await cookies()).set('probe', '1', { httpOnly: true, path: '/', sameSite: 'lax' });
  return Response.json({ ok: true });
}
`;

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

function run(cwd: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

/** The markup without scripts or hashed asset paths: two builds of the same sources must render the same document. */
function normalize(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/\/_next\/static\/[^"'\s)]+/g, '/_next/static/X');
}

describe('phase 3 readiness: proxy + cookie route fit in the standalone server', () => {
  it('T104: a temporary copy with proxy.ts and POST /api/probe builds, runs the proxy on /admin/*, sets a httpOnly cookie and leaves the public pages unchanged', async () => {
    const api = await startFakeApi();
    const temp = await mkdtemp(path.join(os.tmpdir(), 'cv-web-proxy-'));
    cleanups.push(async () => {
      await api.close();
      await rm(temp, { recursive: true, force: true });
    });

    for (const entry of ['app', 'components', 'lib', 'public']) {
      await cp(path.join(root, entry), path.join(temp, entry), { recursive: true, filter: (src) => !/\.test\.tsx?$/.test(src) });
    }
    for (const file of ['next.config.ts', 'package.json']) await cp(path.join(root, file), path.join(temp, file));
    // Tests are not copied, so the copy type-checks only the sources.
    const tsconfig = JSON.parse(await readFile(path.join(root, 'tsconfig.json'), 'utf8')) as { include: string[] };
    await writeFile(path.join(temp, 'tsconfig.json'), JSON.stringify({ ...tsconfig, include: tsconfig.include.filter((glob) => !glob.includes('.dev/')) }));
    // Turbopack refuses a node_modules that points outside the project root, so it is cloned (copy-on-write where the filesystem has it).
    await cp(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });

    await writeFile(path.join(temp, 'proxy.ts'), PROXY);
    await mkdir(path.join(temp, 'app', 'api', 'probe'), { recursive: true });
    await writeFile(path.join(temp, 'app', 'api', 'probe', 'route.ts'), PROBE_ROUTE);

    const env = cleanEnv(['NODE_ENV', 'SITE_URL', 'CV_API_URL'], { CV_API_URL: api.url });
    const build = await run(temp, [path.join(temp, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], env);
    expect(build.code, build.output).toBe(0);
    expect(build.output).toMatch(/Proxy/);

    // The standalone layout of the Docker image: server.js + .next/static + public.
    const standalone = path.join(temp, '.next', 'standalone');
    await cp(path.join(temp, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
    await cp(path.join(temp, 'public'), path.join(standalone, 'public'), { recursive: true });
    const probe = await startStandalone({ apiUrl: api.url, standaloneDir: standalone });
    const baseline = await startStandalone({ apiUrl: api.url });
    cleanups.push(async () => {
      await baseline.stop();
      await probe.stop();
    });

    const admin = await fetch(`${probe.url}/admin/x`);
    // No admin page exists yet: the catch-all answers 404, but the proxy must have run before it.
    expect(admin.status).toBe(404);
    expect(admin.headers.get('x-probe-proxy')).toBe('ran');

    const cookie = await fetch(`${probe.url}/api/probe`, { method: 'POST' });
    expect(cookie.status).toBe(200);
    const setCookie = cookie.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/probe=1/);
    expect(setCookie).toMatch(/HttpOnly/i);

    for (const page of PAGES) {
      const withProxy = await fetch(`${probe.url}${page}`);
      const without = await fetch(`${baseline.url}${page}`);
      expect(withProxy.status, page).toBe(200);
      expect(withProxy.headers.get('x-probe-proxy'), page).toBeNull();
      expect(withProxy.headers.get('set-cookie'), page).toBeNull();
      expect(normalize(await withProxy.text()), page).toBe(normalize(await without.text()));
    }
  }, 240_000);
});
