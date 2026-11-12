import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { cleanEnv } from './helpers/env';
import { startFakeApi } from './helpers/fake-api';

/** Result of the single `next build` of a test run (see `tests/runtime`). */
export interface BuildInfo {
  /** Exit code of `next build`. */
  code: number | null;
  /** stdout + stderr of the build (it holds the route table). */
  output: string;
  /** Requests the fake API received while building (must be 0). */
  apiRequests: string[];
  /** Pristine copy of the standalone server: `server.js`, `.next/static` and `public/`. */
  standaloneDir: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    build: BuildInfo;
  }
}

const root = path.resolve(__dirname, '..');

function runBuild(apiUrl: string): Promise<{ code: number | null; output: string }> {
  // SITE_URL is left unset on purpose: nothing may be baked at build time.
  const env = cleanEnv(['NODE_ENV', 'SITE_URL', 'CV_API_URL'], { CV_API_URL: apiUrl });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], { cwd: root, env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, output }));
  });
}

/** One `next build` per test run, against a recording fake API that must stay untouched. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const api = await startFakeApi();
  const standaloneDir = await mkdtemp(path.join(os.tmpdir(), 'cv-web-standalone-'));
  try {
    const { code, output } = await runBuild(api.url);
    if (code === 0) {
      await cp(path.join(root, '.next', 'standalone'), standaloneDir, { recursive: true });
      await cp(path.join(root, '.next', 'static'), path.join(standaloneDir, '.next', 'static'), { recursive: true });
      await cp(path.join(root, 'public'), path.join(standaloneDir, 'public'), { recursive: true });
    }
    project.provide('build', { code, output, apiRequests: [...api.requests], standaloneDir });
  } catch (error) {
    await rm(standaloneDir, { recursive: true, force: true });
    throw error;
  } finally {
    await api.close();
  }
  return () => rm(standaloneDir, { recursive: true, force: true });
}
