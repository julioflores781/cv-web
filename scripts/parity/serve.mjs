// @ts-check
// Tiny static server for the parity tooling: the rendered reference, `public/` and `app/fonts/`.
// Read-only: it never writes to disk.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { isMain, option, ROOT } from './common.mjs';
import { FONT_URL_PREFIX, RENDERED_DIR } from './render-reference.mjs';

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

/**
 * Resolves `relative` under `base`, or null if it would escape it.
 * @param {string} base
 * @param {string} relative
 * @returns {string | null}
 */
function resolveUnder(base, relative) {
  const target = path.resolve(base, relative);
  return target === base || target.startsWith(base + path.sep) ? target : null;
}

/**
 * @param {{renderedDir?: string, publicDir?: string, fontsDir?: string}} [dirs]
 * @returns {http.Server}
 */
export function createParityServer({
  renderedDir = RENDERED_DIR,
  publicDir = path.join(ROOT, 'public'),
  fontsDir = path.join(ROOT, 'app/fonts'),
} = {}) {
  return http.createServer(async (req, res) => {
    /** @type {(status: number, body: string, type?: string) => void} */
    const send = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed');

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      return send(400, 'Bad request');
    }
    if (pathname.includes('\0') || pathname.split('/').includes('..')) return send(403, 'Forbidden');

    const resolved = pathname.startsWith(FONT_URL_PREFIX)
      ? [resolveUnder(fontsDir, pathname.slice(FONT_URL_PREFIX.length))]
      : [resolveUnder(renderedDir, pathname.slice(1)), resolveUnder(publicDir, pathname.slice(1))];
    const candidates = resolved.filter((candidate) => candidate !== null);
    if (candidates.length < resolved.length) return send(403, 'Forbidden');

    for (const candidate of candidates) {
      const info = await stat(candidate).catch(() => null);
      if (info?.isFile()) {
        res.writeHead(200, {
          'Content-Type': CONTENT_TYPES[path.extname(candidate)] ?? 'application/octet-stream',
          'Content-Length': info.size,
        });
        if (req.method === 'HEAD') return res.end();
        return createReadStream(candidate).pipe(res);
      }
    }
    return send(404, 'Not found');
  });
}

if (isMain(import.meta.url)) {
  const port = Number(option('port', '4010'));
  createParityServer().listen(port, () => {
    process.stdout.write(`parity server on http://localhost:${port}/perfil.html\n`);
  });
}
