// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allRoutes, alternatesFor, resolveRoute, routePath, routeSlug } from './routes';

describe('routes', () => {
  it('BA-T1: [], [servicios], [en] and [en, services] resolve to the four pages', () => {
    expect(resolveRoute([])).toEqual({ lang: 'es', page: 'profile' });
    expect(resolveRoute(undefined)).toEqual({ lang: 'es', page: 'profile' });
    expect(resolveRoute(['servicios'])).toEqual({ lang: 'es', page: 'services' });
    expect(resolveRoute(['en'])).toEqual({ lang: 'en', page: 'profile' });
    expect(resolveRoute(['en', 'services'])).toEqual({ lang: 'en', page: 'services' });
  });

  it('BA-T2: services in the wrong language, unknown languages and extra segments do not exist (and never throw)', () => {
    for (const slug of [['services'], ['en', 'servicios'], ['fr'], ['en', 'x'], ['servicios', 'x'], ['es'], ['en', 'en'], ['en', 'services', 'x']]) {
      expect(resolveRoute(slug), slug.join('/')).toBeNull();
    }
  });

  it('BA-T3: every route has its path and alternates (es, en, x-default = the Spanish path of the same page)', () => {
    expect(routePath({ lang: 'es', page: 'profile' })).toBe('/');
    expect(routePath({ lang: 'es', page: 'services' })).toBe('/servicios/');
    expect(routePath({ lang: 'en', page: 'profile' })).toBe('/en/');
    expect(routePath({ lang: 'en', page: 'services' })).toBe('/en/services/');
    expect(alternatesFor('profile')).toEqual({ es: '/', en: '/en/', 'x-default': '/' });
    expect(alternatesFor('services')).toEqual({ es: '/servicios/', en: '/en/services/', 'x-default': '/servicios/' });
  });

  it('extra: routeSlug is the inverse of resolveRoute for the 4 routes (and there are exactly 4)', () => {
    const routes = allRoutes();
    expect(routes).toHaveLength(4);
    for (const route of routes) expect(resolveRoute(routeSlug(route))).toEqual(route);
  });
});
