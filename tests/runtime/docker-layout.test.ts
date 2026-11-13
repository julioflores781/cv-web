// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { startFakeApi } from '@/tests/helpers/fake-api';
import { startStandalone } from '@/tests/helpers/standalone';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await (cleanups.pop() as () => Promise<void>)();
});

describe('standalone with the layout of the Docker image', () => {
  it('T97: the page, a static asset under /_next/static and a public file answer 200', async () => {
    const api = await startFakeApi();
    // The harness copy is the image layout: server.js + .next/static + public (see the runtime stage of the Dockerfile).
    const server = await startStandalone({ apiUrl: api.url });
    cleanups.push(async () => {
      await server.stop();
      await api.close();
    });

    const page = await fetch(`${server.url}/`);
    expect(page.status).toBe(200);
    const html = await page.text();
    const css = /\/_next\/static\/[^"']+\.css/.exec(html)?.[0];
    expect(css, 'a stylesheet under /_next/static in the HTML').toBeDefined();
    expect((await fetch(`${server.url}${css as string}`)).status).toBe(200);
    expect((await fetch(`${server.url}/hex-grid-plano.svg`)).status).toBe(200);
  }, 60_000);

  it('W20: the standalone ships the compiled instrumentation and the Dockerfile (copy of the standalone, HEALTHCHECK) is unchanged', () => {
    const { standaloneDir } = inject('build');
    expect(existsSync(path.join(standaloneDir, '.next', 'server', 'instrumentation.js'))).toBe(true);
    const dockerfile = readFileSync(path.resolve(__dirname, '..', '..', 'Dockerfile'), 'utf8');
    expect(dockerfile).toContain('COPY --from=build --chown=app:app /app/.next/standalone ./');
    expect(dockerfile).toContain('CMD node -e "fetch(\'http://127.0.0.1:3000/api/health/\').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"');
    expect(dockerfile).toContain('HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3');
    expect(dockerfile).not.toMatch(/instrumentation/i);
  });
});
