import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';
import { cleanEnv } from './env';

export interface StandaloneOptions {
  /** `CV_API_URL` of the server. */
  apiUrl: string;
  /** `SITE_URL` of the server (default: a test host). */
  siteUrl?: string;
  /** Extra files under `public/`, keyed by relative path (e.g. `projects/x.webp`); they get a private copy of the server. */
  publicFiles?: Record<string, string>;
  /** Run this standalone directory instead of the pristine build of the test run (it must already hold `.next/static` and `public/`). */
  standaloneDir?: string;
}

export interface StandaloneServer {
  url: string;
  /** Everything the server printed so far (stdout + stderr). */
  log: () => string;
  stop: () => Promise<void>;
}

export const TEST_SITE = 'https://cv.example.test';

const running = new Set<ChildProcess>();
// A crashed test worker must not leave servers behind.
process.on('exit', () => running.forEach((child) => child.kill('SIGKILL')));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** Starts the built standalone server (from the pristine copy of `tests/global-build.ts`) and waits until it is ready. */
export async function startStandalone(options: StandaloneOptions): Promise<StandaloneServer> {
  const build = inject('build');
  if (build.code !== 0) throw new Error(`next build failed (exit ${build.code}):\n${build.output}`);

  let dir = options.standaloneDir ?? build.standaloneDir;
  let privateCopy: string | undefined;
  if (options.publicFiles) {
    privateCopy = await mkdtemp(path.join(os.tmpdir(), 'cv-web-standalone-copy-'));
    await cp(dir, privateCopy, { recursive: true });
    for (const [file, content] of Object.entries(options.publicFiles)) {
      const target = path.join(privateCopy, 'public', file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    dir = privateCopy;
  }

  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: dir,
    env: cleanEnv(['NODE_ENV', 'SITE_URL', 'CV_API_URL', 'PORT', 'HOSTNAME'], {
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      CV_API_URL: options.apiUrl,
      SITE_URL: options.siteUrl ?? TEST_SITE,
    }),
  });
  running.add(child);
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));

  const stop = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const killer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(killer);
    }
    running.delete(child);
    if (privateCopy) await rm(privateCopy, { recursive: true, force: true });
  };

  // Ready = the server logs «Ready» (event-driven, no sleeping); an early exit is an error.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server not ready in 30 s:\n${output}`)), 30_000);
    const check = (): void => {
      if (/Ready in/.test(output)) {
        clearTimeout(timer);
        child.stdout.off('data', check);
        resolve();
      }
    };
    child.stdout.on('data', check);
    void exited.then(() => {
      clearTimeout(timer);
      reject(new Error(`server exited early:\n${output}`));
    });
    check();
  }).catch(async (error: unknown) => {
    await stop();
    throw error;
  });

  return { url: `http://127.0.0.1:${port}`, log: () => output, stop };
}
