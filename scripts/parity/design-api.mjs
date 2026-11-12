// @ts-check
// Fake CV API that answers with the copy of the v2 design ("design data"), in the shape of the real contracts.
// Development tool for visual parity only: it is never published and never mixed with the "Ada Ejemplo" test fixtures.
// Usage: `npm run parity:api -- --port 4020`, then build the web with `CV_API_URL=http://localhost:4020`.
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { isMain, option } from './common.mjs';

const DATA = JSON.parse(readFileSync(new URL('./design-data.json', import.meta.url), 'utf8'));
const RESOURCES = ['resume', 'architecture', 'services', 'projects'];

/**
 * Pure routing: returns the JSON body (or null) and status for an API path and language.
 * @param {string} pathname
 * @param {string | null} lang `es` (default) or `en`
 */
export function designResponse(pathname, lang) {
  // Quarkus readiness (the web's /api/health/ and the Docker smoke test depend on it).
  if (pathname === '/q/health/ready') return { status: 200, body: { status: 'UP', checks: [] } };
  const language = lang ?? 'es';
  if (!(language in DATA)) return { status: 400, body: { title: 'Invalid language', status: 400, code: 'LANG_INVALID' } };
  const match = /^\/api\/v1\/([a-z]+)\/?$/.exec(pathname);
  const resource = match?.[1];
  if (!resource || !RESOURCES.includes(resource)) return { status: 404, body: { title: 'Not found', status: 404 } };
  return { status: 200, body: DATA[language][resource] };
}

export function createDesignApi() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { status, body } = req.method === 'GET'
      ? designResponse(url.pathname, url.searchParams.get('lang'))
      : { status: 405, body: { title: 'Method not allowed', status: 405 } };
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(body));
  });
}

if (isMain(import.meta.url)) {
  const port = Number(option('port', '4020'));
  createDesignApi().listen(port, () => {
    process.stdout.write(`design API on http://localhost:${port}/api/v1/resume?lang=es\n`);
  });
}
