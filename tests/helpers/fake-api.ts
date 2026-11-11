import { startServer, json, type TestServer } from './http-server';
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
}

/** Local stand-in for the CV API (`/resume`, `/architecture`, `/services` and `/projects`). The real API is never contacted. */
export function startFakeApi(options: FakeApiOptions = {}): Promise<TestServer> {
  const resume = options.resume ?? dirtyResume;
  const architecture = options.architecture ?? architectureFor;
  const services = options.services ?? servicesFor;
  const projects = options.projects ?? projectsFor;
  return startServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://x');
    const lang: Lang = url.searchParams.get('lang') === 'en' ? 'en' : 'es';
    if (url.pathname === '/api/v1/resume') json(res, 200, resume(lang));
    else if (url.pathname === '/api/v1/architecture') json(res, 200, architecture(lang));
    else if (url.pathname === '/api/v1/services') json(res, 200, services(lang));
    else if (url.pathname === '/api/v1/projects') json(res, 200, projects(lang));
    else json(res, 404, { title: 'Not found', detail: url.pathname, status: 404, code: 'NOT_FOUND' });
  });
}
