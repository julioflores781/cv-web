// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const read = (...file: string[]): string => readFileSync(path.join(root, ...file), 'utf8');
const workflow = read('.github', 'workflows', 'ci.yml');

/** Returns the lines of one top-level (indent 0) or `jobs:` child block, without needing a YAML dependency. */
function block(source: string, header: RegExp): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => header.test(line));
  expect(start, `block ${header}`).toBeGreaterThanOrEqual(0);
  const indent = (lines[start] as string).search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && line.search(/\S/) <= indent) break;
    body.push(line);
  }
  return body.join('\n');
}

describe('ci workflow', () => {
  it('T1: triggers on push to main, v* tags and pull_request; cancels only PR runs; read-only permissions', () => {
    const on = block(workflow, /^on:/);
    expect(on).toMatch(/^\s+push:/m);
    expect(on).toMatch(/branches:\s*\[\s*main\s*\]/);
    expect(on).toMatch(/tags:\s*\[\s*"v\*"\s*\]/);
    expect(on).toMatch(/^\s+pull_request:/m);
    const concurrency = block(workflow, /^concurrency:/);
    expect(concurrency).toMatch(/cancel-in-progress:\s*\$\{\{\s*github\.event_name == 'pull_request'\s*\}\}/);
    expect(workflow).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
    expect(block(workflow, /^permissions:/).trim()).toBe('contents: read');
  });

  it('T2: job test checks out with v7, sets up Node from .nvmrc and runs npm ci, lint, typecheck and test with a timeout', () => {
    const job = block(workflow, /^ {2}test:/);
    expect(job).toMatch(/timeout-minutes:\s*\d+/);
    expect(job).toMatch(/uses:\s*actions\/checkout@v7\b/);
    expect(job).toMatch(/uses:\s*actions\/setup-node@v\d+/);
    expect(job).toMatch(/node-version-file:\s*\.nvmrc/);
    expect(readFileSync(path.join(root, '.nvmrc'), 'utf8').trim()).toBe('22');
    expect(job).toMatch(/cache:\s*npm/);
    const runs = [...job.matchAll(/^\s+run:\s*(.+)$/gm)].map((match) => (match[1] as string).trim());
    expect(runs).toEqual(['npm ci', 'npm run lint', 'npm run typecheck', 'npm test']);
  });

  it('T3: no pull_request_target, no literal credentials, credentials only through secrets.*', () => {
    expect(workflow).not.toMatch(/pull_request_target/);
    expect(workflow).not.toMatch(/gh[p]_|AKI[A]|-----BEGI[N]|xo[x][bp]-/);
    const credentialLines = workflow.split('\n').filter((line) => /(token|password|secret|username|key)\s*:/i.test(line));
    for (const line of credentialLines) expect(line, line).toMatch(/\$\{\{\s*secrets\./);
  });
});

/** Lines that are not comments (the compose and the Dockerfile document commented-out options). */
const active = (source: string): string =>
  source
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

describe('Dockerfile', () => {
  const dockerfile = active(read('Dockerfile'));

  it('T92: multi-stage Node 22 standalone image, non-root, port 3000, health check on /api/health/ and exec CMD, no secrets', () => {
    const stages = [...dockerfile.matchAll(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/gm)];
    expect(stages.length).toBeGreaterThanOrEqual(3);
    for (const stage of stages) expect(stage[1]).toMatch(/^node:22/);
    expect(dockerfile).toMatch(/COPY\s+--from=build\s+(--chown=\S+\s+)?\/app\/\.next\/standalone\s/);
    expect(dockerfile).toMatch(/COPY\s+--from=build\s+(--chown=\S+\s+)?\/app\/\.next\/static\s/);
    expect(dockerfile).toMatch(/COPY\s+--from=build\s+(--chown=\S+\s+)?\/app\/public\s/);
    const user = [...dockerfile.matchAll(/^USER\s+(\S+)/gm)].map((match) => match[1]);
    expect(user.length).toBeGreaterThan(0);
    expect(user.at(-1)).not.toMatch(/^(root|0)$/);
    expect(dockerfile).toMatch(/HOSTNAME=0\.0\.0\.0/);
    expect(dockerfile).toMatch(/PORT=3000/);
    expect(dockerfile).toMatch(/^EXPOSE\s+3000\s*$/m);
    expect(dockerfile).toMatch(/^HEALTHCHECK[\s\S]*?\/api\/health\/['"`)]/m);
    expect(dockerfile).toMatch(/^CMD\s+\[\s*"node"\s*,\s*"server\.js"\s*\]\s*$/m);
    expect(dockerfile).not.toMatch(/\.env/);
    expect(dockerfile).not.toMatch(/^(ENV|ARG)\s+\S*(SECRET|TOKEN|PASSWORD|SALT)/im);
  });

  it('T93: .dockerignore keeps node_modules, build output, git, env files, progress and design out of the context', () => {
    const ignored = read('.dockerignore')
      .split('\n')
      .map((line) => line.trim());
    for (const entry of ['node_modules', '.next', 'out', '.git', '.env*', 'progress', 'design']) expect(ignored).toContain(entry);
  });
});

describe('deploy/docker-compose.yml', () => {
  const compose = read('deploy', 'docker-compose.yml');
  const code = active(compose);
  const service = (name: string): string => block(compose, new RegExp(`^ {2}${name}:`));

  it('T94: cv-web waits for a healthy cv-api, joins default and padelhub, has no ports/env_file/variables and no cache settings', () => {
    for (const name of ['cv-db', 'cv-api', 'cv-web']) expect(code).toMatch(new RegExp(`^ {2}${name}:`, 'm'));
    const web = active(service('cv-web'));
    expect(web).toMatch(/image:\s*julioflores781\/cv-web(:latest)?\s*$/m);
    expect(web).toMatch(/depends_on:\s*\n\s+cv-api:\s*\n\s+condition:\s*service_healthy/);
    expect(web).toMatch(/^\s+healthcheck:/m);
    expect(web).toMatch(/networks:\s*\[\s*default\s*,\s*padelhub\s*\]/);
    expect(web).toMatch(/restart:\s*unless-stopped/);
    expect(web).not.toMatch(/^\s+ports:/m);
    expect(web).toMatch(/CV_API_URL:\s*http:\/\/cv-api:8080\s*$/m);
    expect(web).toMatch(/SITE_URL:\s*https:\/\/floreslab\.dev\s*$/m);
    expect(code).not.toMatch(/env_file/);
    expect(code).not.toMatch(/\$\{/);
    expect(code).not.toMatch(/REVALIDATE_|CV_CACHE_/);
  });

  it('T95: cv-db stays off padelhub, cv-api keeps its readiness check and every secret is a CAMBIA placeholder', () => {
    expect(active(service('cv-db'))).not.toMatch(/padelhub/);
    expect(active(service('cv-api'))).toMatch(/curl -fsS http:\/\/localhost:8080\/q\/health\/ready/);
    const secrets = [...code.matchAll(/^\s+(\w*(?:PASSWORD|SALT)\w*):\s*(\S*)/gm)];
    expect(secrets.map((match) => match[1])).toEqual(['POSTGRES_PASSWORD', 'QUARKUS_DATASOURCE_PASSWORD', 'CV_CONTACT_IP_SALT']);
    for (const [, name, value] of secrets) expect(value, name).toMatch(/^CAMBIA-/);
    expect(code).toMatch(/CV_CONTACT_TELEGRAM_BOT_TOKEN:\s*""/);
    expect(code).not.toMatch(/CORS/i);
  });
});

describe('deploy/docker-compose.yml: admin and R2 variables of cv-api', () => {
  const api = active(block(read('deploy', 'docker-compose.yml'), /^ {2}cv-api:/));
  const value = (name: string): string | undefined => new RegExp(`^\\s+${name}:\\s*("[^"]*"|[^\\s#]+)`, 'm').exec(api)?.[1];

  it('extra Da: every admin and R2 variable the API reads is declared, with the documented defaults and no unused R2_KEY_PREFIX', () => {
    for (const name of [
      'CV_ADMIN_JWT_SECRET',
      'CV_ADMIN_SESSION_LIFESPAN',
      'CV_ADMIN_LOGIN_MAX_FAILURES',
      'CV_ADMIN_LOGIN_LOCK',
      'CV_ADMIN_EDGE_BLOCK',
      'R2_ENDPOINT',
      'R2_BUCKET_NAME',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_PUBLIC_URL',
    ]) {
      expect(value(name), name).toBeDefined();
    }
    expect(value('CV_ADMIN_SESSION_LIFESPAN')).toBe('PT8H');
    expect(value('CV_ADMIN_LOGIN_MAX_FAILURES')).toBe('"5"');
    expect(value('CV_ADMIN_LOGIN_LOCK')).toBe('PT15M');
    expect(api).not.toMatch(/R2_KEY_PREFIX/);
  });

  it('extra Db: the Cloudflare edge guard is on, and the R2 credentials and public URL ship empty (upload disabled)', () => {
    expect(value('CV_ADMIN_EDGE_BLOCK')).toBe('"true"');
    for (const name of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_PUBLIC_URL']) expect(value(name), name).toBe('""');
    expect(value('R2_ENDPOINT')).toMatch(/^https:\/\/CAMBIA-/);
    expect(value('R2_BUCKET_NAME')).toMatch(/^CAMBIA-/);
  });

  it('extra Dc: the JWT secret is a CAMBIA placeholder shorter than 32 characters, so an unedited compose leaves the admin disabled', () => {
    const secret = value('CV_ADMIN_JWT_SECRET') as string;
    expect(secret).toMatch(/^CAMBIA-/);
    expect(secret.length).toBeLessThan(32);
  });

  it('extra Dd: the Argon2 knobs are only commented-out documentation and the container has no memory limit that would starve them', () => {
    expect(api).not.toMatch(/CV_ADMIN_ARGON2_/);
    expect(read('deploy', 'docker-compose.yml')).toMatch(/^\s+# CV_ADMIN_ARGON2_MEMORY_KIB:/m);
    expect(api).not.toMatch(/mem_limit|memory:|deploy:/);
  });
});

describe('ci workflow: docker job', () => {
  const job = block(workflow, /^ {2}docker:/);

  it('T96: docker job needs test, runs only on push, builds amd64 for the smoke and publishes amd64+arm64 with secrets only via secrets.*', () => {
    expect(job).toMatch(/^\s+needs:\s*test\b/m);
    expect(job).toMatch(/^\s+if:\s*github\.event_name == 'push'\s*(#.*)?$/m);
    for (const action of ['setup-qemu-action', 'setup-buildx-action', 'login-action', 'metadata-action']) {
      expect(job).toMatch(new RegExp(`uses:\\s*docker/${action}@v\\d+`));
    }
    expect(job).toMatch(/images:\s*.+\/cv-web\s*$/m);
    expect(job).toMatch(/platforms:\s*linux\/amd64\s*\n\s+load:\s*true/);
    expect(job).toMatch(/platforms:\s*linux\/amd64,linux\/arm64\s*\n\s+push:\s*true/);
    const credentialLines = job.split('\n').filter((line) => /(token|password|secret|username)\s*:/i.test(line));
    expect(credentialLines.length).toBeGreaterThan(0);
    for (const line of credentialLines) expect(line, line).toMatch(/\$\{\{\s*secrets\./);
  });

  it('T99 (file check): the smoke stops the container with SIGTERM, accepts exit 0 or 143 and requires < 10 s', () => {
    expect(job).toMatch(/docker stop -t 10 cv-web/);
    expect(job).toMatch(/\[ "\$code" = 0 \] \|\| \[ "\$code" = 143 \]/);
    expect(job).toMatch(/\[ "\$elapsed" -lt 10 \]/);
  });
});
