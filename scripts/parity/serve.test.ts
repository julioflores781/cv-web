// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeAllVariants } from './render-reference.mjs';
import { createParityServer } from './serve.mjs';

/** `fetch` normalises `..`, so the raw path is sent with `http.get`. */
function rawGet(port: number, rawPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });
}

describe('serve', () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    const renderedDir = await mkdtemp(path.join(os.tmpdir(), 'parity-rendered-'));
    await writeAllVariants(renderedDir);
    server = createParityServer({ renderedDir });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // RF-T5 (RF-A3)
  it('RF-T5: serves the render, the hex SVG and a woff2 with the right type; paths with .. are refused', async () => {
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(`${base}/perfil.html`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');

    const svg = await fetch(`${base}/hex-grid-plano.svg`);
    expect(svg.status).toBe(200);
    expect(svg.headers.get('content-type')).toBe('image/svg+xml');

    const font = await fetch(`${base}/app/fonts/ibm-plex-sans-latin-400-normal.woff2`);
    expect(font.status).toBe(200);
    expect(font.headers.get('content-type')).toBe('font/woff2');

    for (const bad of ['/../package.json', '/app/fonts/../../package.json', '/%2e%2e/package.json']) {
      expect([403, 404]).toContain(await rawGet(port, bad));
    }
  });
});
