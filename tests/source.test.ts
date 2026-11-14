// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { containsSecret } from './helpers/secret-scan';

const root = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'lib', 'tests'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && entry.name !== 'schema.d.ts' ? [full] : [];
  });
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file) || file.includes(`${path.sep}tests${path.sep}`);
const all = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(root, dir)));
const production = all.filter((file) => !isTest(file));
const rel = (files: string[]) => files.map((file) => path.relative(root, file));

describe('source rules', () => {
  it('T85/T294 (CO-T70): fetch( only in lib/api, lib/contact/client.ts and lib/admin/browser-client.ts (neither has http(s):// nor process.env); process.env only in lib/api/config.ts', () => {
    const inApi = (file: string) => file.startsWith(path.join(root, 'lib', 'api') + path.sep);
    const contactClient = path.join(root, 'lib', 'contact', 'client.ts');
    const adminClient = path.join(root, 'lib', 'admin', 'browser-client.ts');
    const fetchers = production.filter((file) => /\bfetch\(/.test(readFileSync(file, 'utf8')));
    expect(rel(fetchers.filter((file) => !inApi(file) && file !== contactClient && file !== adminClient))).toEqual([]);
    expect(fetchers).toContain(contactClient);
    expect(fetchers).toContain(adminClient);
    const envReaders = production.filter((file) => /process\.env/.test(readFileSync(file, 'utf8')));
    expect(rel(envReaders.filter((file) => !inApi(file)))).toEqual([]);
    for (const client of [contactClient, adminClient]) expect(readFileSync(client, 'utf8')).not.toMatch(/https?:\/\/|process\.env/);
    expect(rel(envReaders)).toEqual([path.join('lib', 'api', 'config.ts')]);
  });

  it('T294: the session cookie name appears only in lib/admin/session.ts', () => {
    const name = ['cv', 'admin', 'token'].join('_');
    const holders = production.filter((file) => readFileSync(file, 'utf8').includes(name));
    expect(rel(holders)).toEqual([path.join('lib', 'admin', 'session.ts')]);
    const proxy = readFileSync(path.join(root, 'proxy.ts'), 'utf8');
    expect(proxy).not.toContain(name);
    expect(existsSync(path.join(root, 'middleware.ts'))).toBe(false);
  });

  it('CO-T71: lib/contact has no node:*, process.env, console.* nor storage APIs', () => {
    const files = production.filter((file) => file.startsWith(path.join(root, 'lib', 'contact') + path.sep));
    expect(files.length).toBeGreaterThanOrEqual(4);
    const forbidden = /node:|process\.env|\bconsole\.|localStorage|sessionStorage|indexedDB|document\.cookie/;
    expect(rel(files.filter((file) => forbidden.test(readFileSync(file, 'utf8'))))).toEqual([]);
  });

  it("T86 (CO-T72): 'use client' files import @/lib/api only as types and never node:*", () => {
    const clients = production.filter((file) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')));
    expect(clients.length).toBeGreaterThanOrEqual(5);
    const offenders = clients.filter((file) => {
      const imports = [...readFileSync(file, 'utf8').matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)];
      return imports.some(([, isType, source]) => (source as string).startsWith('node:') || (!isType && /^@\/lib\/api(\/|$)/.test(source as string)));
    });
    expect(rel(offenders)).toEqual([]);
  });

  it("T295: 'use client' files never import lib/admin/session, lib/api nor node:* at runtime", () => {
    const clients = production.filter((file) => /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')));
    expect(clients.map((file) => path.relative(root, file))).toEqual(expect.arrayContaining([path.join('components', 'admin', 'login-form.tsx')]));
    const offenders = clients.filter((file) => {
      const imports = [...readFileSync(file, 'utf8').matchAll(/^import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)];
      return imports.some(([, isType, source]) => {
        const from = source as string;
        return !isType && (/^@\/lib\/admin\/session$/.test(from) || /^@\/lib\/api(\/|$)/.test(from) || from.startsWith('node:') || /\.\/session$/.test(from));
      });
    });
    expect(rel(offenders)).toEqual([]);
  });

  it('T296: the dependencies are the ones of before the panel (no new library)', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@fontsource/barlow-condensed', '@fontsource/ibm-plex-mono', '@fontsource/ibm-plex-sans', '@react-pdf/renderer', 'next', 'react', 'react-dom']);
    expect(Object.keys(pkg.devDependencies)).toHaveLength(18);
  });

  it('T419: no code reads the old public screenshot folder nor calls the old file resolver; the covers come from project.images', () => {
    const needles = [['public', 'projects'].join('/'), ['resolve', 'Project', 'Images'].join(''), ['/projects/', '.webp'].join('${project.id}')];
    const offenders = all.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return needles.some((needle) => text.includes(needle));
    });
    expect(rel(offenders)).toEqual([]);
    expect(existsSync(path.join(root, 'public', 'projects'))).toBe(false);
  });

  it('T69: no debug logging call is left in the source', () => {
    const needle = ['console', 'log'].join('.');
    const offenders = all.filter((file) => readFileSync(file, 'utf8').includes(needle));
    expect(rel(offenders)).toEqual([]);
  });

  it('extra (PD-T27): @react-pdf/renderer is pinned to 4.9.0 and the @fontsource fonts to 5.3.0, all in dependencies', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@react-pdf/renderer']).toBe('4.9.0');
    for (const name of ['barlow-condensed', 'ibm-plex-sans', 'ibm-plex-mono']) expect(pkg.dependencies[`@fontsource/${name}`]).toBe('5.3.0');
  });

  it('T70: package.json defines dev, build, test, lint and typecheck', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    for (const script of ['dev', 'build', 'test', 'lint', 'typecheck']) {
      expect(pkg.scripts[script], script).toBeTruthy();
    }
  });
});

describe('runtime data rules', () => {
  it('T17: no data cache, fallback copy, source flag nor next/cache in production code', () => {
    expect(existsSync(path.join(root, 'lib', 'api', 'cache.ts'))).toBe(false);
    const forbidden = /ContentUnavailableError|ContentSource|unstable_cache|revalidateTag|next\/cache|CV_CACHE_DIR/;
    expect(rel(production.filter((file) => forbidden.test(readFileSync(file, 'utf8'))))).toEqual([]);
  });

  it('T24: the page is force-dynamic, has no generateStaticParams, takes no apiUrl/source and reads through the shared per-request memo', () => {
    const source = readFileSync(path.join(root, 'app', '[[...slug]]', 'page.tsx'), 'utf8');
    expect(source).toMatch(/export const dynamic = 'force-dynamic'/);
    expect(source).not.toMatch(/generateStaticParams|dynamicParams/);
    expect(source).not.toMatch(/apiUrl|\bsource\b/);
    expect(source).toMatch(/from '@\/lib\/api'/);
    expect(readFileSync(path.join(root, 'lib', 'api', 'content.ts'), 'utf8')).toMatch(/export const getContent = cache\(/);
  });
});

describe('PDF cache rules', () => {
  it('T68: lib/pdf and the PDF routes use no unstable_cache nor next/cache, and the in-memory map has a constant cap', () => {
    const files = production.filter((file) => file.startsWith(path.join(root, 'lib', 'pdf') + path.sep) || /cv-julio-flores-\w+\.pdf/.test(file));
    expect(files.length).toBeGreaterThanOrEqual(8);
    expect(rel(files.filter((file) => /unstable_cache|next\/cache/.test(readFileSync(file, 'utf8'))))).toEqual([]);
    expect(readFileSync(path.join(root, 'lib', 'pdf', 'build-cv-pdf.ts'), 'utf8')).toMatch(/export const MAX_CACHED_PDFS = \d+;/);
  });
});

describe('not-found page', () => {
  it('T74: has a title, noindex robots and no hard-coded domain', () => {
    const source = readFileSync(path.join(root, 'app/not-found.tsx'), 'utf8');
    expect(source).toMatch(/title:/);
    expect(source).toMatch(/index:\s*false/);
    expect(source).not.toMatch(/floreslab/);
    expect(source).toMatch(/getConfig/);
  });

  it('extra (PA): has no CSS module, which Next.js would preload on every page and make the console warn', () => {
    expect(readFileSync(path.join(root, 'app/not-found.tsx'), 'utf8')).not.toMatch(/\.module\.css/);
  });
});

describe('public repository hygiene', () => {
  // Tracked plus untracked-but-not-ignored files, so a leak shows up locally before committing.
  const candidates = [
    ...new Set(
      execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0'),
    ),
  ]
    // progress/ holds harness notes that name the forbidden patterns on purpose (audited by hand, R10).
    // Files deleted in the working tree (not yet committed) are still listed by git.
    .filter((file) => file !== '' && file !== 'package-lock.json' && !file.startsWith('progress/') && existsSync(path.join(root, file)));

  it('T89: no versioned file (progress/ excluded) mentions the old subdomain nor the old hosting', () => {
    // Built from parts so this file does not match its own patterns.
    const forbidden = new RegExp([['cv', 'floreslab', 'dev'].join('\\.'), ['pages', 'dev'].join('\\.'), 'Cloudflare\\s+Pages'].join('|'), 'i');
    const offenders = candidates.filter((file) => {
      const content = readFileSync(path.join(root, file));
      return !content.includes(0) && forbidden.test(content.toString('utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('T5: no .env files but .env.example, .gitignore covers .env*, and no secret patterns in the source tree', () => {
    expect(candidates.filter((file) => /(^|\/)\.env/.test(file) && path.basename(file) !== '.env.example')).toEqual([]);
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n')).toContain('.env*');

    const offenders = candidates.filter((file) => {
      const content = readFileSync(path.join(root, file));
      return !content.includes(0) && containsSecret(content.toString('utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('T5 extra: Actions secret references and CAMBIA- placeholders are accepted; literal values are rejected', () => {
    // Keys are assembled so this file does not match the scanner itself.
    const pass = ['pass', 'word'].join('');
    const secret = ['SEC', 'RET'].join('');
    expect(containsSecret(`${pass}: \${{ secrets.DOCKERHUB_TOKEN }}`)).toBe(false);
    expect(containsSecret(`${pass}: '\${{secrets.X_1}}'`)).toBe(false);
    expect(containsSecret(`${secret}: CAMBIA-secret`)).toBe(false);
    expect(containsSecret(`${pass}: hunter2`)).toBe(true);
    expect(containsSecret(`${pass}: "\${{ secrets.X }}-literal"`)).toBe(true);
    expect(containsSecret(`${pass}: \${{ env.PASSWORD }}`)).toBe(true);
    expect(containsSecret(`${secret}: abc`)).toBe(true);
  });

  it('T5 extra: token shapes are matched case-sensitively', () => {
    expect(containsSecret(['gh', 'p_', 'a'.repeat(20)].join(''))).toBe(true);
    expect(containsSecret(['AKI', 'A', 'B'.repeat(16)].join(''))).toBe(true);
    expect(containsSecret(['-----BEGI', 'N PRIVATE KEY-----'].join(''))).toBe(true);
    expect(containsSecret(['GH', 'P_', 'a'.repeat(20)].join(''))).toBe(false);
    expect(containsSecret('akia is a word')).toBe(false);
  });
});

describe('panel regression: docs, secrets and fixtures', () => {
  const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
  const emitters = [...production, path.join(root, 'proxy.ts'), path.join(root, 'instrumentation.ts')];
  // Tracked plus untracked-but-not-ignored files, like the hygiene checks above.
  const candidates = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((file) => file !== '' && existsSync(path.join(root, file)));

  it('T424: every log event the code emits is documented in docs/web-standards.md, which has an Admin section and names X-Client-IP', () => {
    const events = new Set(emitters.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/logEvent\(\s*[^,]+,\s*'([a-z_]+)'/g)].map((match) => match[1] as string)));
    expect(events.size).toBeGreaterThanOrEqual(18);
    for (const event of ['admin_login', 'admin_messages_view', 'admin_api_call', 'admin_internal', 'admin_session_expired']) expect(events, event).toContain(event);
    const standards = read('docs/web-standards.md');
    expect([...events].filter((event) => !standards.includes(`\`${event}\``))).toEqual([]);
    expect(standards).toMatch(/^## Admin/m);
    expect(standards).toContain('X-Client-IP');
    // The old line «no proxy.ts» is gone; the proxy is documented without a log line per visit.
    expect(standards).not.toMatch(/no se usa `proxy\.ts`/);
    for (const file of ['AGENTS.md', 'CLAUDE.md']) expect(read(file), file).toMatch(/\/admin/);
  });

  it('T425: the panel code, the fake API and the fixtures hold no secret nor real contact data; the people in them are fictional', () => {
    const panel = candidates.filter((file) => /^(app\/admin|components\/admin|lib\/admin|lib\/api\/admin|proxy\.ts|scripts\/parity\/admin-fake|tests\/fixtures)/.test(file));
    expect(panel.length).toBeGreaterThan(50);
    expect(panel.filter((file) => containsSecret(read(file)))).toEqual([]);
    // No JWT, bearer token or private key literal anywhere in them.
    expect(panel.filter((file) => /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|Bearer [A-Za-z0-9._-]{20,}|PRIVATE KEY/.test(read(file)))).toEqual([]);

    const data = candidates.filter((file) => file.startsWith('tests/fixtures/') || file === 'scripts/parity/admin-fake.mjs' || file.startsWith('tests/helpers/'));
    const emails = data.flatMap((file) => [...read(file).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g)].map((match) => match[0]));
    expect(emails.length).toBeGreaterThan(0);
    // Only the domains reserved for examples (RFC 2606).
    expect(emails.filter((email) => !/@(?:[a-z0-9-]+\.)*example\.(?:test|com|org|net)$/.test(email))).toEqual([]);
    expect(data.filter((file) => /\+\d{1,3}[ -]?\d{2,4}[ -]?\d{3}[ -]?\d{3}/.test(read(file)))).toEqual([]);
    for (const file of ['tests/fixtures/resume.ts', 'tests/fixtures/content.ts', 'tests/fixtures/admin-validation-vectors.json']) expect(read(file), file).toContain('Ada Ejemplo');
  });

  it('regresion extra: the content handler validates the kind with the shared isContentKind, not a copy of the list', () => {
    const handlers = rel(production).filter((file) => file.startsWith('app/admin/api/content/'));
    expect(handlers.length).toBeGreaterThanOrEqual(2);
    for (const file of handlers) {
      const source = read(file);
      expect(source, file).toContain('isContentKind(');
      expect(source, file).not.toMatch(/CONTENT_KINDS|const isKind/);
    }
  });
});
