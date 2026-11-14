import { createAdminFake, type AdminFake, type AdminFakeOptions } from '@/scripts/parity/admin-fake.mjs';
import type { ServerResponse } from 'node:http';
import { startServer, json, type Handler, type TestServer } from './http-server';
import { architectureFor, projectsFor, servicesFor } from '@/tests/fixtures/content';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import type { Lang } from '@/lib/i18n/config';

/** Private fields a hostile API could send; the build must never publish them. */
export const SENTINELS = {
  phone: '+00-SENTINEL-PHONE-0000',
  dni: 'SENTINEL-DNI-12345',
  birthDate: '1900-01-01-SENTINEL-BIRTH',
};

/** The «Ada Ejemplo» resume plus the private sentinels above, in every place the old API used to put them. */
export function dirtyResume(lang: Lang): Record<string, unknown> {
  const base = lang === 'es' ? resumeEs : resumeEn;
  return {
    ...base,
    phone: SENTINELS.phone,
    dni: SENTINELS.dni,
    birthDate: SENTINELS.birthDate,
    profile: { ...base.profile, phone: SENTINELS.phone, birthDate: SENTINELS.birthDate },
    contact: { ...base.contact, phone: SENTINELS.phone },
  };
}

export interface FakeApiOptions {
  /** Body for `GET /api/v1/resume?lang=<lang>`; defaults to the sentinel-laden «Ada Ejemplo» resume. */
  resume?: (lang: Lang) => unknown;
  /** Body for `GET /api/v1/architecture?lang=<lang>`; defaults to the «Ada Ejemplo» diagram. */
  architecture?: (lang: Lang) => unknown;
  /** Body for `GET /api/v1/services?lang=<lang>`; defaults to the «Ada Ejemplo» services. */
  services?: (lang: Lang) => unknown;
  /** Body for `GET /api/v1/projects?lang=<lang>`; defaults to the «Ada Ejemplo» projects. */
  projects?: (lang: Lang) => unknown;
  /** Handler for `POST /api/v1/contact/messages` (the request body is drained first); without it the route answers 404. */
  contact?: Handler;
  /** Called first on every request; a reply short-circuits the fixtures (failures, bad payloads). Closures make it switchable mid-test. */
  respond?: (resource: string, lang: Lang) => FakeReply | undefined;
  /**
   * Mounts the admin contract (`/api/v1/admin/*`) of `scripts/parity/admin-fake.mjs`, the single implementation shared with `design-api.mjs`. Pass options to
   * create it, or an instance to keep a handle on it before the server starts. Once content is saved (or seeded), the public reads serve it. Without it the admin routes are 404.
   */
  admin?: AdminFakeOptions | AdminFake;
}

/** The server plus, when `admin` was asked for, the fake behind it (state, fault injection, unlock). */
export type FakeApiServer = TestServer & { admin: AdminFake | undefined };

export interface FakeReply {
  status: number;
  body: unknown;
}

/** Local stand-in for the CV API (`/resume`, `/architecture`, `/services`, `/projects` and the readiness probe). The real API is never contacted. */
export async function startFakeApi(options: FakeApiOptions = {}): Promise<FakeApiServer> {
  const resume = options.resume ?? dirtyResume;
  const architecture = options.architecture ?? architectureFor;
  const services = options.services ?? servicesFor;
  const projects = options.projects ?? projectsFor;
  const admin = options.admin === undefined ? undefined : 'handle' in options.admin ? options.admin : createAdminFake(options.admin);

  const fixtures = (res: ServerResponse, pathname: string, lang: Lang): void => {
    if (pathname === '/api/v1/resume') json(res, 200, resume(lang));
    else if (pathname === '/api/v1/architecture') json(res, 200, architecture(lang));
    else if (pathname === '/api/v1/services') json(res, 200, services(lang));
    else if (pathname === '/api/v1/projects') json(res, 200, projects(lang));
    else if (pathname === '/q/health/ready') json(res, 200, { status: 'UP', checks: [] });
    else json(res, 404, { title: 'Not found', detail: pathname, status: 404, code: 'NOT_FOUND' });
  };

  const server = await startServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x');
    const lang: Lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
    const resource = url.pathname.replace('/api/v1/', '');
    if (options.contact && req.method === 'POST' && url.pathname === '/api/v1/contact/messages') {
      const { contact } = options;
      req.resume();
      req.on('end', () => contact(req, res));
      return;
    }
    const forced = options.respond?.(resource, lang);
    if (forced) json(res, forced.status, forced.body);
    else if (admin) void admin.handle(req, res).then((handled) => handled || fixtures(res, url.pathname, lang));
    else fixtures(res, url.pathname, lang);
  });
  return Object.assign(server, { admin });
}
